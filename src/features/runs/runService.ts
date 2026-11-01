import { prisma } from '../../core/db/index.js';
import { getFailedJob, getJobLogs } from '../github/githubService.js';
import { scrapeLog, extractGithubRunId } from './scraper.js';

export async function investigateRun(runId: string): Promise<void> {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: { repository: true },
  });

  if (!run) {
    throw new Error(`Run #${runId} not found in database`);
  }

  const [owner, repo] = run.repository.fullName.split('/');
  if (!owner || !repo) {
    throw new Error(`Invalid repository fullName: ${run.repository.fullName}`);
  }

  const githubRunId = extractGithubRunId(run.githubRunUrl);
  if (!githubRunId) {
    throw new Error(`Could not extract GitHub run ID from URL: ${run.githubRunUrl}`);
  }

  // 1. Transition status to INVESTIGATING
  await prisma.run.update({
    where: { id: runId },
    data: {
      status: 'INVESTIGATING',
    },
  });

  await prisma.runStep.updateMany({
    where: { runId, name: 'Detect' },
    data: { status: 'completed' },
  });

  await prisma.runStep.create({
    data: {
      runId,
      name: 'Investigate',
      status: 'in_progress',
      summary: 'Downloading and analyzing CI failure logs...',
    },
  });

  console.log(`[RunService] Investigating run ${runId} for ${owner}/${repo}...`);

  // 2. Download the failed job's logs via GitHub API
  const failedJob = await getFailedJob(owner, repo, githubRunId);
  if (!failedJob) {
    console.warn(`[RunService] No failed job found for GitHub run #${githubRunId}`);
    return;
  }

  console.log(`[RunService] Found failed job: ${failedJob.name}`);

  const rawLogs = await getJobLogs(owner, repo, failedJob.id);
  if (!rawLogs) {
    console.warn(`[RunService] Could not retrieve logs for job #${failedJob.id}`);
    return;
  }

  // 3. Scrape all errors and multi-file references
  const scraped = scrapeLog(rawLogs);

  // 4. Build a clean summary of what files failed
  const fileCount = scraped.failingFiles.length;
  let fileSummaryText = 'No specific code files detected';

  if (fileCount === 1 && scraped.failingFiles[0]) {
    fileSummaryText = `in ${scraped.failingFiles[0].filePath}`;
  } else if (fileCount > 1) {
    const fileList = scraped.failingFiles.map((f) => f.filePath).join(', ');
    fileSummaryText = `across ${fileCount} files: ${fileList}`;
  }

  const stepSummary = `Identified ${scraped.errorType} ${fileSummaryText}: ${scraped.errorMessage.slice(0, 70)}`;

  // 5. Update Run in PostgreSQL with root cause and structured failure details
  await prisma.run.update({
    where: { id: runId },
    data: {
      rootCause: scraped.errorMessage,
      failureReason: scraped.errorType,
      failingLog: {
        lines: scraped.snippet.split('\n'),
        failingFiles: scraped.failingFiles,
      } as any,
    },
  });

  // 6. Complete the Investigate step
  await prisma.runStep.updateMany({
    where: { runId, name: 'Investigate' },
    data: {
      status: 'completed',
      summary: stepSummary,
    },
  });

  console.log(
    `[RunService] Completed investigation for run ${runId}. Detected: ${scraped.errorType} (${fileCount} file(s))`
  );
}
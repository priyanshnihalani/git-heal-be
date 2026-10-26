import { prisma } from '../../core/db/index.js'
import type { GithubWorkflowRunPayload } from './types.js'

export async function handleWorkflowFailure(payload: GithubWorkflowRunPayload): Promise<void> {
    const { workflow_run: run, installation } = payload;
    if (!run) return;

    const repoData = run.repository;
    const installationId = BigInt(installation?.id ?? 0);

    const repository = await prisma.repository.upsert({
        where: {
            id: String(repoData?.id)
        },
        update: {
            name: repoData.name,
            fullName: repoData.full_name,
            isPrivate: repoData.private,
            language: repoData.language ?? null,
            installationId,
            lastCiStatus: run.conclusion ?? 'failure',
        },
        create: {
            id: String(repoData.id),
            name: repoData.name,
            fullName: repoData.full_name,
            isPrivate: repoData.private,
            language: repoData.language ?? null,
            installationId,
            lastCiStatus: run.conclusion ?? 'failure',
            monitored: true,
            hasWorkflows: true,
        },
    });

    if (!repository.monitored) {
        console.log(`[Webhook] Skipping unmonitored repository: ${repository.fullName}`);
        return;
    }

    const createdRun = await prisma.run.create({
        data: {
            repoId: repository.id,
            branch: run.head_branch,
            commitHash: run.head_sha,
            commitMessage: run.head_commit?.message ?? 'No commit message',
            githubRunUrl: run.html_url,
            status: 'DETECTED',
            steps: {
                create: [
                    {
                        name: 'Detect',
                        status: 'in_progress',
                        summary: `Workflow "${run.name}" failed on branch ${run.head_branch}`,
                    },
                ],
            },
        },
    });

    console.log(`[Webhook] Recorded failed run ${createdRun.id} for ${repository.fullName}`);

}
import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import { BaseMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { prisma } from '../../core/db/index.js';
import { gemini38Model } from '../../core/ai/gemini.js';
import { getRepoContent } from '../github/githubService.js';
import { prepareWorkspace, getWorkspaceDiff, cleanupWorkspace } from '../sandbox/workspaceManager.js';
import { readWorkspaceFile, editWorkspaceFile } from '../sandbox/workspaceTools.js';

export async function generatePatch(runId: string): Promise<void> {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: { repository: true },
  });

  if (!run) {
    throw new Error(`Run #${runId} not found in database`);
  }

  const [owner, repo] = run.repository.fullName.split('/');
  if (!owner || !repo) {
    throw new Error(`Invalid repository name: ${run.repository.fullName}`);
  }

  await prisma.run.update({
    where: { id: runId },
    data: { status: 'PATCHING' },
  });

  await prisma.runStep.create({
    data: {
      runId,
      name: 'Patch',
      status: 'in_progress',
      summary: 'Preparing local workspace and generating code fix with Gemini...',
    },
  });

  console.log(`[PatchAgent] Starting patch generation for run ${runId}...`);

  const failingLogData = run.failingLog as {
    lines?: string[];
    failingFiles?: Array<{ filePath: string; lines: number[] }>;
  } | null;

  const failingFiles = failingLogData?.failingFiles ?? [];

  if (run.failureReason === 'infra_error' || failingFiles.length === 0) {
    console.log(`[PatchAgent] Detected infrastructure or config error. Alerting developer.`);

    await prisma.run.update({
      where: { id: runId },
      data: {
        status: 'FAILED_TO_FIX',
        humanRecommendation: `This failure appears to be an environment, network, secret, or Docker issue (${run.rootCause}). Please check your CI environment variables and service connections.`,
      },
    });

    await prisma.runStep.updateMany({
      where: { runId, name: 'Patch' },
      data: {
        status: 'completed',
        summary: 'Flagged as infrastructure/config issue. Developer notified.',
      },
    });

    return;
  }

  const workspaceFiles = [];
  for (const fileRef of failingFiles) {
    try {
      const content = await getRepoContent(owner, repo, fileRef.filePath, run.commitHash);
      workspaceFiles.push({ path: fileRef.filePath, content });
    } catch (err) {
      console.warn(`[PatchAgent] Could not fetch ${fileRef.filePath} from GitHub:`, err);
    }
  }

  if (workspaceFiles.length === 0) {
    console.warn(`[PatchAgent] No files could be loaded into the workspace.`);
    return;
  }

  await prepareWorkspace(runId, workspaceFiles);

  try {
    const readFile = tool(
      async ({ filePath, startLine, endLine }) => {
        try {
          return await readWorkspaceFile(runId, filePath, startLine, endLine);
        } catch (err: any) {
          return `Error: ${err.message}`;
        }
      },
      {
        name: 'read_workspace_file',
        description: 'Read specific line numbers of a file in the workspace.',
        schema: z.object({
          filePath: z.string().describe('Relative path to file, e.g. src/auth/login.ts'),
          startLine: z.number().optional().describe('Start line number'),
          endLine: z.number().optional().describe('End line number'),
        }),
      }
    );

    const editFile = tool(
      async ({ filePath, targetCode, replacementCode }) => {
        const res = await editWorkspaceFile(runId, filePath, targetCode, replacementCode);
        return res.message;
      },
      {
        name: 'edit_workspace_file',
        description: 'Replace an exact target snippet in a workspace file with corrected code.',
        schema: z.object({
          filePath: z.string().describe('Relative path to file to edit'),
          targetCode: z.string().describe('Exact code substring to replace'),
          replacementCode: z.string().describe('New replacement code'),
        }),
      }
    );

    const toolsByName = {
      read_workspace_file: readFile,
      edit_workspace_file: editFile,
    };

    const modelWithTools = gemini38Model.bindTools([readFile, editFile]);

    const systemPrompt = `You are Git Heal, an autonomous CI/CD repair engineer.
Your task is to fix the broken CI build by editing files in the workspace.

RULES:
1. First, call 'read_workspace_file' to view the lines around the error.
2. Formulate the minimal, correct fix.
3. Call 'edit_workspace_file' to apply the surgical fix.
4. If this is an infrastructure or secret issue that code cannot fix, do not edit files; simply explain why in your final response.
5. After applying the edit, provide a concise 1-2 sentence explanation of your fix.`;

    const userPrompt = `Repository: ${run.repository.fullName}
Commit Message: ${run.commitMessage ?? 'None'}
Error: ${run.rootCause}

Failing Files:
${failingFiles.map((f) => `- ${f.filePath} (lines: ${f.lines.join(', ') || 'unknown'})`).join('\n')}

Log Snippet:
${(failingLogData?.lines ?? []).slice(0, 30).join('\n')}`;

    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ];

    for (let turn = 0; turn < 5; turn++) {
      const response = await modelWithTools.invoke(messages);
      messages.push(response);

      if (!response.tool_calls || response.tool_calls.length === 0) {
        break;
      }

      for (const toolCall of response.tool_calls) {
        const selectedTool = toolsByName[toolCall.name as keyof typeof toolsByName];
        if (selectedTool) {
          const toolOutput = await (selectedTool as any).invoke(toolCall.args);
          messages.push(
            new ToolMessage({
              content: String(toolOutput),
              tool_call_id: toolCall.id ?? toolCall.name,
            })
          );
        }
      }
    }

    const diff = await getWorkspaceDiff(runId);

    if (diff.trim().length > 0) {
      console.log(`[PatchAgent] Successfully generated patch diff for ${runId}!`);

      await prisma.run.update({
        where: { id: runId },
        data: {
          patch: {
            diff,
            filesModified: failingFiles.map((f) => f.filePath),
          } as any,
        },
      });

      await prisma.runStep.updateMany({
        where: { runId, name: 'Patch' },
        data: {
          status: 'completed',
          summary: `Generated code patch across ${failingFiles.length} file(s).`,
        },
      });
    } else {
      console.log(`[PatchAgent] No diff was generated.`);
    }
  } finally {
    await cleanupWorkspace(runId);
  }
}
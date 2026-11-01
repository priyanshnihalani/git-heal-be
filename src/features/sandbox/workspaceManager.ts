import fs from "node:fs/promises"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile);

const WORKSPACES_ROOT = path.resolve(process.cwd(), '.workspaces')

export interface WorkspaceFile {
    path: string,
    content: string
}

export async function prepareWorkspace(runId: string, files: WorkspaceFile[]): Promise<string> {
    const workspacePath = path.resolve(WORKSPACES_ROOT, runId);
    await fs.mkdir(workspacePath, { recursive: true })

    for (const file of files) {
        const fullFilePath = path.join(workspacePath, file.path);
        const parentDir = path.dirname(fullFilePath);

        await fs.mkdir(parentDir, { recursive: true })
        await fs.writeFile(fullFilePath, file.content)
    }

    try {
        await execFileAsync('git', ['init'], { cwd: workspacePath });
        await execFileAsync('git', ['add', '.'], { cwd: workspacePath });
        await execFileAsync(
            'git',
            ['-c', 'user.name=GitHeal', '-c', 'user.email=bot@githeal.dev', 'commit', '-m', 'original'],
            { cwd: workspacePath }
        );
    } catch (error) {
        console.error(`[Workspace] Failed to init git in ${workspacePath}:`, error);
    }

    return workspacePath
}

export async function getWorkspaceDiff(runId: string): Promise<string> {
    const workspacePath = path.join(WORKSPACES_ROOT, runId);
    try {
        const { stdout } = await execFileAsync('git', ['diff'], { cwd: workspacePath });
        return stdout;
    } catch (error) {
        console.error(`[Workspace] Failed to generate git diff for ${runId}:`, error);
        return '';
    }
}


export async function cleanupWorkspace(runId: string): Promise<void> {
    const workspacePath = path.join(WORKSPACES_ROOT, runId);
    try {
        await fs.rm(workspacePath, { recursive: true, force: true });
        console.log(`[Workspace] Cleaned up temporary directory: ${workspacePath}`);
    } catch (error) {
        console.warn(`[Workspace] Could not delete ${workspacePath}:`, error);
    }
}


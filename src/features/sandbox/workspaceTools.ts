import fs from 'fs/promises'
import path from 'path'

const WORKSPACES_ROOT = path.resolve(process.cwd(), '.workspaces');

export async function readWorkspaceFile(
    runId: string,
    relativePath: string,
    startLine?: number,
    endLine?: number
): Promise<string> {

    const fullPath = path.join(WORKSPACES_ROOT, runId, relativePath)
    let content: string;
    try {
        content = await fs.readFile(fullPath, 'utf-8');
    } catch (error) {
        throw new Error(`File "${relativePath}" not found in workspace`);
    }

    const lines = content.split(/\r?\n/);
    const start = Math.max(1, startLine ?? 1);
    const end = Math.min(lines.length, endLine ?? lines.length);

    const numberedLines: string[] = [];
    for (let i = start; i <= end; i++) {
        const lineText = lines[i - 1] ?? '';
        numberedLines.push(`${i} | ${lineText}`);
    }

    return numberedLines.join('\n');
}

export async function editWorkspaceFile(
  runId: string,
  relativeFilePath: string,
  targetCode: string,
  replacementCode: string
): Promise<{ success: boolean; message: string }> {
  const fullPath = path.join(WORKSPACES_ROOT, runId, relativeFilePath);
  let content: string;
  try {
    content = await fs.readFile(fullPath, 'utf-8');
  } 
  catch (error) {
    return { success: false, message: `File "${relativeFilePath}" does not exist in workspace` };
  }

  if (!content.includes(targetCode)) {
    return {
      success: false,
      message: `Could not find the target code in ${relativeFilePath}. Check whitespace and line content.`,
    };
  }

  const updatedContent = content.replace(targetCode, replacementCode);
  await fs.writeFile(fullPath, updatedContent, 'utf-8');
  return {
    success: true,
    message: `Successfully edited ${relativeFilePath}`,
  };
}
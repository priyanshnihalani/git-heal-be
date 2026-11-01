export interface FailingFile {
  filePath: string;
  lines: number[];
}

export interface ScrapedError {
  errorMessage: string;
  snippet: string;
  errorType: 'test_failure' | 'build_error' | 'syntax_error' | 'infra_error' | 'unknown';
  // All failing files and lines found across the log snippet
  failingFiles: FailingFile[];
  // Primary failing file (for easy quick reference)
  failingFile?: string;
  failingLine?: number;
}

function stripAnsi(text: string): string {
  const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
  return text.replace(ansiRegex, '');
}

export function scrapeLog(rawLogs: string): ScrapedError {
  const cleanLogs = stripAnsi(rawLogs);
  const lines = cleanLogs.split(/\r?\n/);

  let failureLineIndex = -1;
  let detectedType: ScrapedError['errorType'] = 'unknown';
  let errorMessage = 'Unknown CI failure';

  // 1. Scan lines from bottom to top (errors usually appear near the end of the log)
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? '';

    // Check for Infrastructure/Network errors first
    if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|missing required secret/i.test(line)) {
      failureLineIndex = i;
      detectedType = 'infra_error';
      errorMessage = line.trim();
      break;
    }

    // Check for Test Failures (Jest, Vitest, Mocha)
    if (/FAIL\s+|●\s+|✕\s+|AssertionError/i.test(line)) {
      failureLineIndex = i;
      detectedType = 'test_failure';
      errorMessage = line.trim();
      break;
    }

    // Check for standard JS/TS Errors
    if (/(TypeError|ReferenceError|SyntaxError|Error):\s+/i.test(line)) {
      failureLineIndex = i;
      detectedType = /SyntaxError/i.test(line) ? 'syntax_error' : 'build_error';
      errorMessage = line.trim();
      break;
    }
  }

  // Fallback if no specific trigger pattern matched: pick the last non-empty lines
  if (failureLineIndex === -1) {
    failureLineIndex = Math.max(0, lines.length - 20);
  }

  // 2. Extract a window of lines around the failure (15 before, 35 after for multi-file stack traces)
  const startLine = Math.max(0, failureLineIndex - 15);
  const endLine = Math.min(lines.length, failureLineIndex + 35);
  const snippet = lines.slice(startLine, endLine).join('\n');

  // 3. Extract ALL failing files and line numbers from the snippet
  // Pattern 1: at ... (src/path/to/file.ts:42:10) or at src/path/to/file.ts:42:10
  // Pattern 2: FAIL src/path/to/file.test.ts
  const stackRegex = /(?:at\s+(?:.*?\()?(?<path>[a-zA-Z0-9_\-\.\/]+?\.[a-zA-Z0-9]+):(?<line>\d+)(?::\d+)?\)?|FAIL\s+(?<failPath>[a-zA-Z0-9_\-\.\/]+?\.[a-zA-Z0-9]+))/g;

  const filesMap = new Map<string, Set<number>>();

  for (const match of snippet.matchAll(stackRegex)) {
    const filePath = match.groups?.path || match.groups?.failPath;
    const lineStr = match.groups?.line;

    if (!filePath) continue;

    // Filter out node_modules, internal Node binaries, and non-project files
    if (filePath.includes('node_modules') || filePath.startsWith('node:')) {
      continue;
    }

    if (!filesMap.has(filePath)) {
      filesMap.set(filePath, new Set<number>());
    }

    if (lineStr) {
      filesMap.get(filePath)!.add(parseInt(lineStr, 10));
    }
  }

  // Convert the map to an array of FailingFile objects
  const failingFiles: FailingFile[] = Array.from(filesMap.entries()).map(([filePath, lineSet]) => ({
    filePath,
    lines: Array.from(lineSet),
  }));

  const primaryFile = failingFiles[0];

  return {
    errorMessage,
    snippet,
    errorType: detectedType,
    failingFiles,
    ...(primaryFile !== undefined && { failingFile: primaryFile.filePath }),
    ...(primaryFile?.lines[0] !== undefined && { failingLine: primaryFile.lines[0] }),
  };
}

export function extractGithubRunId(url: string): string | null {
  const match = url.match(/\/actions\/runs\/(\d+)/);
  return match ? match[1]! : null;
}
import 'dotenv/config'

const GITHUB_API_BASE = process.env.GITHUB_API_BASE || 'https://api.github.com'
const GITHUB_TOKEN = process.env.GITHUB_TOKEN

function getHeaders(): Record<string, string> {
    if (!GITHUB_TOKEN) throw new Error("Missing GITHUB_TOKEN")
    return {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'GitHeal',
    }
}

export async function getFailedJob(owner: string, repo: string, runId: number | string): Promise<{ id: number, name: string } | null> {
    try {
        const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/actions/runs/${runId}/jobs`

        const response = await fetch(url, {
            headers: getHeaders(),
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch jobs for run #${runId}: ${response.statusText}`);
        }

        const data = (await response.json()) as {
            jobs: Array<{ id: number; name: string; conclusion: string | null }>;
        };

        const failedJob = data.jobs.find((job) => job.conclusion === 'failure');
        if (!failedJob) return null;

        return { id: failedJob.id, name: failedJob.name };

    } catch (error) {
        console.error('Error fetching failed job:', error);
        return null;
    }
}

export async function getJobLogs(owner: string, repo: string, jobId: number): Promise<string | null> {
    try {
        const url =
            `${GITHUB_API_BASE}/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`;

        const response = await fetch(url, { headers: getHeaders() });

        if (!response.ok) {
            throw new Error(`Failed to fetch logs for job #${jobId}: ${response.statusText}`);
        }

        const logs = await response.text();
        return logs;
    } catch (error) {
        console.error('Error fetching logs:', error);
        return null;
    }
}

export async function getRepoContent(
    owner: string,
    repo: string,
    path: string,
    ref?: string
): Promise<string> {
    const url = new URL(`${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}`);
    if (ref) {
        url.searchParams.set('ref', ref);
    }
    const response = await fetch(url.toString(), {
        headers: getHeaders(),
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch ${path} from ${owner}/${repo}: ${response.statusText}`);
    }
    const data = (await response.json()) as {
        content?: string;
        encoding?: string;
    };
    if (!data.content) {
        throw new Error(`File ${path} has no content`);
    }
    return Buffer.from(data.content, 'base64').toString('utf-8');
}
export interface GithubWorkflowRunPayload {
    action: 'requested' | 'completed' | 'in_progress';
    workflow_run?: {
        id: number;
        name: string;
        head_branch: string;
        head_sha: string;
        event: string;
        status: string;
        conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'timed_out' | 'action_required' | null;
        html_url: string;
        head_commit?: {
            id: string;
            message: string;
            author: {
                name: string;
                email: string;
            };
        };
        repository: {
            id: number;
            name: string;
            full_name: string;
            private: boolean;
            language?: string | null;
            owner: {
                login: string;
            };
        };
    }
    installation?: {
        id: number;
    };
}
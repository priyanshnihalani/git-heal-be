import { Router, type Request, type Response } from 'express'
import { verifyWebhookSignature } from './verifySignature.js'
import { handleWorkflowFailure } from './webHookHandler.js'
import type { GithubWorkflowRunPayload } from './types.js'
import 'dotenv/config'

export const webhookRouter = Router();

webhookRouter.post("/github", async (req: Request, res: Response) => {
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const event = req.headers["x-github-event"] as string | undefined;
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody

    const verification = verifyWebhookSignature(
        {
            rawBody,
            signature,
            secret: process.env.GITHUB_WEBHOOK_SECRET! || ""
        }
    )

    if (!verification.isValid) {
        console.log("[Webhook] Invalid signature: ", verification.error);
        return res.status(401).json({ error: verification.error }); 
    }

    if (event === 'ping') {
        return res.status(200).json({ message: 'pong' });
    }

    res.status(200).json({ received: true, event });

    if (event == "workflow_run") {
        const payload = req.body as GithubWorkflowRunPayload;

        if (payload.action == "completed" && payload.workflow_run?.conclusion == "failure") {
            try {
                await handleWorkflowFailure(payload)
            } catch (error) {
                console.error('[Webhook] Failed to process workflow failure:', error);
            }
        }
    }
})
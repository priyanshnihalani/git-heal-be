import crypto from 'node:crypto'

export interface webVerificationResult {
    isValid: boolean,
    error?: string
}

interface webhookBody {
    rawBody: Buffer | undefined,
    signature: string | undefined,
    secret: string
}
export function verifyWebhookSignature(params: webhookBody): webVerificationResult {
    if (!params.secret) {
        return {
            isValid: false, error: 'GITHUB_WEBHOOK_SECRET is not configured'
        }
    }

    if (!params.signature) {
        return { isValid: false, error: 'Missing X-Hub-Signature-256 header' };
    }

    if (!params.rawBody) {
        return { isValid: false, error: 'Missing raw request body buffer' };
    }

    const parts = params.signature.split('=');

    if (parts.length !== 2 || parts[0] !== 'sha256') {
        return { isValid: false, error: 'Invalid signature format' };
    }

    const expectedSignature = crypto.createHmac('sha256', params.secret)
        .update(params.rawBody)
        .digest('hex');

    const signatureBuffer = Buffer.from(parts[1]!, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (signatureBuffer.length !== expectedBuffer.length) {
        return { isValid: false, error: 'Signature length mismatch' };
    }

    const isMatch = crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

    return isMatch
        ? { isValid: true }
        : { isValid: false, error: 'Signature mismatch' };
}
import 'dotenv/config';
import express, { type Request } from 'express';
import cors from 'cors';
import { webhookRouter } from './features/webhooks/routes.js';

const app = express();

app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);

app.use(cors());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/webhooks', webhookRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Git Heal backend running on http://localhost:${PORT}`);
});
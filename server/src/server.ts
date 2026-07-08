import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { registerRoutes } from './routes';
import { sendWeeklyDigest } from './services/digest';
import { archiveStaleIdeas } from './services/retention';

const app = express();

// Open to any origin: auth is a Bearer token in the Authorization header
// (not a cookie), so there's no CSRF exposure from allowing cross-origin
// callers — this just lets other frontends/servers hit the API.
app.use(cors({ origin: true }));
// Raised from Express's 100kb default: idea document uploads (documents.routes.ts)
// arrive as base64 JSON, which runs ~33% larger than the raw file (capped at 8MB).
app.use(express.json({ limit: '12mb' }));

registerRoutes(app);

// Every Monday at 09:00 server time (PRD §8.4). Only scheduled when the app
// actually boots via server.ts — buildTestApp() in tests never imports this
// file, so the test suite never triggers a real cron job.
cron.schedule('0 9 * * 1', () => {
  sendWeeklyDigest().catch((err) => console.error('Weekly digest job failed:', err));
});

// PRD §8.7: daily retention sweep, archiving done/declined ideas past the
// configured inactivity window.
cron.schedule('0 3 * * *', () => {
  archiveStaleIdeas().catch((err) => console.error('Retention job failed:', err));
});

const PORT = process.env.PORT ?? 4000;

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

export default app;

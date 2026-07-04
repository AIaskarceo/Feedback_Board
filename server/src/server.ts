import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { registerRoutes } from './routes';

const app = express();

app.use(cors({ origin: process.env.APP_ORIGIN }));
app.use(express.json());

registerRoutes(app);

const PORT = process.env.PORT ?? 4000;

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

export default app;

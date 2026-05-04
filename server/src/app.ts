// dotenv is loaded inside src/config/database.ts (env-aware: .env.<NODE_ENV>
// then .env). Importing config/database first is the convention. The
// Express.Request augmentations (req.user, req.scope) live in src/types/
// express.d.ts and are picked up automatically by tsconfig.
import './config/database.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'node:http';

import { logger, loggerMiddleware } from './middleware/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { db, disconnectDB } from './db/knex.js';

import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';

const app = express();
const server = http.createServer(app);

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: false,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(loggerMiddleware);

// Routes
app.use('/healthcheck', healthRoutes);
app.use('/api/auth', authRoutes);

// 404
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'API endpoint not found' });
});

// Error handler — must be last
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 5001;

if (process.env.NODE_ENV !== 'test') {
  db.raw('SELECT 1')
    .then(() => {
      logger.info('Connected to PostgreSQL');
      server.listen(PORT, () => {
        logger.info(`BIRA server running on port ${PORT}`, {
          env: process.env.NODE_ENV || 'development',
        });
      });
    })
    .catch((err: Error) => {
      logger.error('PostgreSQL connection error', { error: err.message });
      process.exit(1);
    });
}

const shutdown = (signal: string): void => {
  logger.info(`${signal} received, shutting down gracefully`);
  server.close(async () => {
    await disconnectDB();
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app, server };

import type { Environment } from './types';
import { instrument } from '@microlabs/otel-cf-workers';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import {
  checkCalibrationExists,
  listStores,
  persistCalibration,
  runCalibration,
} from './lib/calibrator';
import { createGeminiClient } from './lib/gemini';
import { createOtelConfig } from './lib/otel';
import analyze from './routes/analyze';
import calibrate from './routes/calibrate';
import calibrations from './routes/calibrations';
import health from './routes/health';
import interactions from './routes/interactions';
import registry from './routes/registry';
import search from './routes/search';

const app = new Hono<{ Bindings: Environment }>();
app.use(logger());

app.route('/analyze', analyze);
app.route('/interactions', interactions);
app.route('/search', search);
app.route('/calibrate', calibrate);
app.route('/calibrations', calibrations);
app.route('/registry', registry);
app.route('/health', health);

const worker = {
  fetch: app.fetch,

  // Stub queue handler — old deployment had a queue consumer, kept for backwards compat
  async queue(_batch: MessageBatch, _env: Environment) {
    // No-op: queue processing removed in v2
  },

  async scheduled(
    _controller: ScheduledController,
    env: Environment,
    _ctx: ExecutionContext
  ) {
    // Daily calibration cron: runs at 03:00 UTC, calibrates yesterday for all stores
    const yesterday = new Date(Date.now() - 86400_000)
      .toISOString()
      .split('T')[0];

    try {
      const stores = await listStores(env.DB);
      const gemini = createGeminiClient(env.GEMINI_API_KEY);

      for (const storeId of stores) {
        try {
          const exists = await checkCalibrationExists(
            env.DB,
            storeId,
            yesterday
          );
          if (exists) {
            console.warn(
              `Calibration already exists for ${storeId} on ${yesterday}, skipping`
            );
            continue;
          }

          const result = await runCalibration(
            env.DB,
            gemini,
            storeId,
            yesterday
          );
          await persistCalibration(env.DB, result);
          console.warn(
            `Calibration completed for ${storeId}: confidence=${result.reasoning.confidence}, applied=${result.applied}`
          );
        } catch (err) {
          console.error(
            `Calibration failed for ${storeId}: ${err instanceof Error ? err.message : err}`
          );
        }
      }
    } catch (err) {
      console.error(
        `Cron calibration failed: ${err instanceof Error ? err.message : err}`
      );
    }
  },
};

export default instrument(
  worker,
  createOtelConfig('crow-core-interaction-service')
);

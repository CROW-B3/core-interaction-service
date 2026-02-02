import type { Environment } from './types';
import { OpenAPIHono } from '@hono/zod-openapi';
import { logger } from 'hono/logger';
import { poweredBy } from 'hono/powered-by';
import { HelloWorldRoute, ProcessSessionRoute } from './routes';
import {
  GetSessionInteractionsRoute,
  GetInteractionsByTypeRoute,
  GetInteractionStatsRoute,
  handleGetSessionInteractions,
  handleGetInteractionsByType,
  handleGetInteractionStats,
  handleProcessSession,
} from './handlers/interactions';
import { processBatch, validateQueueMessage } from './services/queue-consumer';

const app = new OpenAPIHono<{ Bindings: Environment }>();

// Middleware
app.use(poweredBy());
app.use(logger());

// Routes
app.openapi(HelloWorldRoute, c => {
  return c.json({ text: 'Hello Hono!' });
});

app.openapi(GetSessionInteractionsRoute, handleGetSessionInteractions);
app.openapi(GetInteractionsByTypeRoute, handleGetInteractionsByType);
app.openapi(GetInteractionStatsRoute, handleGetInteractionStats);
app.openapi(ProcessSessionRoute, handleProcessSession);

// API Documentation
app.doc('/docs', {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'Crow Core Interaction Service',
  },
});

// Queue consumer handler
export default {
  ...app,
  async queue(batch: any, env: Environment): Promise<void> {
    console.log(`Queue handler received batch with ${batch.messages.length} messages`);

    try {
      const messages = batch.messages
        .map((msg: any) => {
          try {
            if (typeof msg.body === 'string') {
              return JSON.parse(msg.body);
            }
            return msg.body;
          } catch (error) {
            console.error('Failed to parse message body:', error);
            return null;
          }
        })
        .filter((msg: any) => msg !== null && validateQueueMessage(msg));

      if (messages.length === 0) {
        console.warn('No valid messages in batch');
        return;
      }

      await processBatch(env, messages);
    } catch (error) {
      console.error('Queue handler error:', error);
      throw error;
    }
  },
} satisfies ExportedHandler<Environment>;

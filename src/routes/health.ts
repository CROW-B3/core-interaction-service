import type { Environment } from '../types';
import { Hono } from 'hono';

const app = new Hono<{ Bindings: Environment }>();

app.get('/', c => {
  return c.json({
    status: 'ok',
    service: 'crow-core-interaction-service',
  });
});

export default app;

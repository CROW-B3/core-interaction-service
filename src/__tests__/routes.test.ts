import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {},
}));

vi.mock('drizzle-orm/d1', () => ({
  drizzle: vi.fn(() => mockDrizzleDb),
}));

vi.mock('../middleware/jwt', () => ({
  createJWTMiddleware: vi.fn(
    () => async (_c: any, next: Function) => next()
  ),
}));

vi.mock('../services/interaction-vectorize', () => ({
  vectorizeInteraction: vi.fn(() => Promise.resolve()),
  searchInteractions: vi.fn(() => Promise.resolve([])),
}));

vi.mock('../cctv-consumer', () => ({
  processCctvBatchMessage: vi.fn(),
}));

vi.mock('../web-session-consumer', () => ({
  processWebSessionExpiry: vi.fn(),
}));

vi.mock('../web-session/pipeline', () => ({
  runSessionAnalysis: vi.fn(),
}));

const mockDrizzleDb = {
  select: vi.fn(() => mockDrizzleDb),
  from: vi.fn(() => mockDrizzleDb),
  where: vi.fn(() => mockDrizzleDb),
  limit: vi.fn(() => mockDrizzleDb),
  offset: vi.fn(() => mockDrizzleDb),
  orderBy: vi.fn(() => mockDrizzleDb),
  groupBy: vi.fn(() => mockDrizzleDb),
  insert: vi.fn(() => mockDrizzleDb),
  values: vi.fn(() => Promise.resolve()),
  delete: vi.fn(() => mockDrizzleDb),
  get: vi.fn(() => null),
};

function setupSelectReturns(results: unknown[]) {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    offset: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    groupBy: vi.fn(() => chain),
    get: vi.fn(() => results[0] ?? null),
    then: (resolve: Function) => Promise.resolve(results).then(resolve),
  };
  mockDrizzleDb.select.mockReturnValue(chain);
  return chain;
}

const mockD1 = {
  prepare: vi.fn(() => ({
    bind: vi.fn(() => ({
      all: vi.fn(() => ({ results: [] })),
      first: vi.fn(() => null),
      run: vi.fn(() => ({ success: true })),
    })),
  })),
};

const mockEnv = {
  DB: mockD1,
  ENVIRONMENT: 'local',
  INTERACTION_ANALYZER: {
    get: vi.fn(),
    idFromName: vi.fn(),
  },
  INTERACTION_VECTORIZE: {
    query: vi.fn(() => ({ matches: [] })),
    insert: vi.fn(),
    upsert: vi.fn(),
  },
  PRODUCT_VECTORIZE: { query: vi.fn(() => ({ matches: [] })) },
  QNA_VECTORIZE: { query: vi.fn(() => ({ matches: [] })) },
  INTERACTION_QUEUE: { send: vi.fn() },
  CCTV_QUEUE: { send: vi.fn() },
  AUTH_SERVICE_URL: 'http://localhost:8001',
  PRODUCT_SERVICE_URL: 'http://localhost:8005',
  WEB_INGEST_SERVICE_URL: 'http://localhost:8013',
  AI_GATEWAY_ID: 'test-gateway',
  SYSTEM_SECRET: 'test-system-secret',
  INTERNAL_GATEWAY_KEY: 'test-key',
  AI: { run: vi.fn() },
  R2_BUCKET: { put: vi.fn(), get: vi.fn() },
};

// The default export is { fetch: app.fetch, queue: ... }
// Import the module - we need to use app.request via a reconstructed Hono app
// or use fetch directly
import serviceExport from '../index';

async function makeRequest(path: string, init?: RequestInit): Promise<Response> {
  const url = `http://localhost${path}`;
  const request = new Request(url, init);
  return serviceExport.fetch(request, mockEnv as any, { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as any);
}

describe('core-interaction-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET / (health check)', () => {
    it('should return 200 with greeting text', async () => {
      const res = await makeRequest('/');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.text).toBe('Hello from Interaction Service!');
    });
  });

  describe('GET /health', () => {
    it('should return 200 with status ok', async () => {
      const res = await makeRequest('/health');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
    });
  });

  describe('POST /api/v1/interactions/create-interaction', () => {
    it('should return 401 without X-Internal-Key', async () => {
      const res = await makeRequest('/api/v1/interactions/create-interaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: 'org-123',
          sourceType: 'web',
          data: 'test data',
          timestamp: Date.now(),
        }),
      });
      expect(res.status).toBe(401);
    });

    it('should return 403 when org ID does not match', async () => {
      mockDrizzleDb.insert.mockReturnValue({
        values: vi.fn(() => Promise.resolve()),
      });

      const res = await makeRequest('/api/v1/interactions/create-interaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Key': 'test-key',
          'X-Organization-Id': 'org-different',
        },
        body: JSON.stringify({
          organizationId: 'org-123',
          sourceType: 'web',
          data: 'test data',
          timestamp: Date.now(),
        }),
      });
      expect(res.status).toBe(403);
    });

    it('should create interaction with valid request', async () => {
      mockDrizzleDb.insert.mockReturnValue({
        values: vi.fn(() => Promise.resolve()),
      });

      const res = await makeRequest('/api/v1/interactions/create-interaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Key': 'test-key',
          'X-Organization-Id': 'org-123',
        },
        body: JSON.stringify({
          organizationId: 'org-123',
          sourceType: 'web',
          data: 'test data',
          timestamp: Date.now(),
        }),
      });
      expect(res.status).toBe(202);
      const body = await res.json();
      expect(body.queued).toBe(true);
    });
  });

  describe('GET /api/v1/interactions/organization/:orgId', () => {
    it('should return 401 without X-Internal-Key', async () => {
      const res = await makeRequest('/api/v1/interactions/organization/org-123');
      expect(res.status).toBe(401);
    });

    it('should return 403 with mismatched org ID', async () => {
      const res = await makeRequest('/api/v1/interactions/organization/org-123', {
        headers: {
          'X-Internal-Key': 'test-key',
          'X-Organization-Id': 'org-different',
        },
      });
      expect(res.status).toBe(403);
    });

    it('should return interactions for matching org', async () => {
      const interactionsChain = {
        from: vi.fn(() => interactionsChain),
        where: vi.fn(() => interactionsChain),
        limit: vi.fn(() => interactionsChain),
        offset: vi.fn(() => interactionsChain),
        orderBy: vi.fn(() => interactionsChain),
        then: (resolve: Function) => Promise.resolve([]).then(resolve),
      };
      const countChain = {
        from: vi.fn(() => countChain),
        where: vi.fn(() => countChain),
        then: (resolve: Function) => Promise.resolve([{ count: 0 }]).then(resolve),
      };
      let callCount = 0;
      mockDrizzleDb.select.mockImplementation(() => {
        callCount++;
        return callCount % 2 === 1 ? interactionsChain : countChain;
      });

      const res = await makeRequest('/api/v1/interactions/organization/org-123', {
        headers: {
          'X-Internal-Key': 'test-key',
          'X-Organization-Id': 'org-123',
        },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.interactions).toBeDefined();
      expect(Array.isArray(body.interactions)).toBe(true);
      expect(body.total).toBeDefined();
    });
  });

  describe('GET /api/v1/interactions/organization/:orgId/summary', () => {
    it('should return 401 without X-Internal-Key', async () => {
      const res = await makeRequest('/api/v1/interactions/organization/org-123/summary');
      expect(res.status).toBe(401);
    });

    it('should return 403 with mismatched org ID', async () => {
      const res = await makeRequest('/api/v1/interactions/organization/org-123/summary', {
        headers: {
          'X-Internal-Key': 'test-key',
          'X-Organization-Id': 'org-different',
        },
      });
      expect(res.status).toBe(403);
    });

    it('should return summary counts for matching org', async () => {
      const chain = {
        from: vi.fn(() => chain),
        where: vi.fn(() => chain),
        groupBy: vi.fn(() => chain),
        then: (resolve: Function) =>
          Promise.resolve([
            { sourceType: 'web', count: 5 },
            { sourceType: 'cctv', count: 3 },
            { sourceType: 'social', count: 2 },
          ]).then(resolve),
      };
      mockDrizzleDb.select.mockReturnValue(chain);

      const res = await makeRequest('/api/v1/interactions/organization/org-123/summary', {
        headers: {
          'X-Internal-Key': 'test-key',
          'X-Organization-Id': 'org-123',
        },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.web).toBe(5);
      expect(body.cctv).toBe(3);
      expect(body.social).toBe(2);
      expect(body.total).toBe(10);
    });
  });

  describe('default export structure', () => {
    it('should export fetch and queue handlers', () => {
      expect(serviceExport.fetch).toBeDefined();
      expect(typeof serviceExport.fetch).toBe('function');
      expect(serviceExport.queue).toBeDefined();
      expect(typeof serviceExport.queue).toBe('function');
    });
  });
});

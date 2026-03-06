import type {
  EmbeddingClient,
  VectorMatch,
  VectorMetadata,
} from '../src/lib/embeddings';
import type { GeminiAnalysis, GeminiClient } from '../src/lib/gemini';
import type { Environment } from '../src/types';

export function createMockGemini(responses?: GeminiAnalysis[]): GeminiClient & {
  callCount: number;
  calls: Array<{ imageBase64: string; previousSummary: string | null }>;
} {
  let idx = 0;
  const defaultAnalysis: GeminiAnalysis = {
    people: [
      {
        description: 'Person in blue shirt',
        location: 'tile 1',
        activity: 'browsing shelves',
      },
    ],
    interactions: ['Two people talking near entrance'],
    movement_patterns: ['Person moved from tile 1 to tile 3'],
    notable_events: [],
    summary: 'One person browsing, conversation near entrance.',
  };

  const mock = {
    callCount: 0,
    calls: [] as Array<{
      imageBase64: string;
      previousSummary: string | null;
    }>,
    async analyzeFrame(
      imageBase64: string,
      previousSummary: string | null
    ): Promise<GeminiAnalysis> {
      mock.callCount++;
      mock.calls.push({ imageBase64, previousSummary });
      const resp = responses
        ? responses[idx % responses.length]
        : defaultAnalysis;
      idx++;
      return resp;
    },
  };
  return mock;
}

export function createFailingGemini(
  failOnCall?: number
): GeminiClient & { callCount: number } {
  let count = 0;
  const mock = {
    callCount: 0,
    async analyzeFrame(
      _imageBase64: string,
      _previousSummary: string | null
    ): Promise<GeminiAnalysis> {
      count++;
      mock.callCount = count;
      if (failOnCall === undefined || count === failOnCall) {
        throw new Error(`Gemini API error on call ${count}`);
      }
      return {
        people: [],
        interactions: [],
        movement_patterns: [],
        notable_events: [],
        summary: `Period ${count} analysis.`,
      };
    },
  };
  return mock;
}

export function createMockR2(): R2Bucket {
  const store = new Map<string, Uint8Array>();

  return {
    put: async (key: string, value: unknown) => {
      store.set(key, value as Uint8Array);
      return {} as R2Object;
    },
    get: async (key: string) => {
      const data = store.get(key);
      if (!data) return null;
      return {
        arrayBuffer: async () => data.buffer,
        key,
        body: new ReadableStream(),
      } as unknown as R2ObjectBody;
    },
    list: async (options?: R2ListOptions) => {
      const prefix = options?.prefix ?? '';
      const objects = [...store.keys()]
        .filter(k => k.startsWith(prefix))
        .map(key => ({ key, size: store.get(key)!.length }));
      return {
        objects,
        truncated: false,
        cursor: '',
      } as unknown as R2Objects;
    },
    delete: async () => {},
    head: async () => null,
    createMultipartUpload: async () => ({}) as any,
    resumeMultipartUpload: () => ({}) as any,
  } as unknown as R2Bucket;
}

export function createMockD1(): D1Database {
  const tables: Map<string, Array<Record<string, unknown>>> = new Map();
  tables.set('interactions', []);
  tables.set('time_period_analyses', []);
  tables.set('camera_registry', []);
  tables.set('calibrations', []);

  const createStatement = (sql: string): D1PreparedStatement => {
    let boundValues: unknown[] = [];
    const stmt = {
      bind(...values: unknown[]) {
        boundValues = values;
        return stmt;
      },
      async first() {
        // calibrations: check existence by store_id + date
        if (sql.includes('FROM calibrations')) {
          const rows = tables.get('calibrations') ?? [];
          if (boundValues.length === 2) {
            const match = rows.find(
              r => r.store_id === boundValues[0] && r.date === boundValues[1]
            );
            return match ?? null;
          }
          if (boundValues.length === 1) {
            const match = rows.find(r => r.store_id === boundValues[0]);
            return match ?? null;
          }
        }
        return null;
      },
      async all() {
        if (
          sql.includes('FROM interactions') &&
          sql.includes('DISTINCT store_id')
        ) {
          const rows = tables.get('interactions') ?? [];
          const stores = [...new Set(rows.map(r => r.store_id))];
          return {
            results: stores.map(s => ({ store_id: s })),
            success: true,
            meta: {},
          };
        }
        if (sql.includes('FROM interactions')) {
          const rows = tables.get('interactions') ?? [];
          let filtered = rows;
          if (boundValues.length > 0) {
            filtered = rows.filter(r => r.store_id === boundValues[0]);
            if (boundValues.length > 1 && sql.includes('session_start = ?')) {
              // Equality filter
              filtered = filtered.filter(
                r => (r.session_start as number) === (boundValues[1] as number)
              );
            } else if (boundValues.length > 1) {
              // Range filter (>= lower bound)
              filtered = filtered.filter(
                r => (r.session_start as number) >= (boundValues[1] as number)
              );
              if (boundValues.length > 2) {
                filtered = filtered.filter(
                  r => (r.session_start as number) < (boundValues[2] as number)
                );
              }
            }
          }
          return { results: filtered, success: true, meta: {} };
        }
        if (sql.includes('FROM time_period_analyses')) {
          const rows = tables.get('time_period_analyses') ?? [];
          let filtered = rows;
          if (boundValues.length > 0) {
            filtered = rows.filter(r => r.interaction_id === boundValues[0]);
          }
          return { results: filtered, success: true, meta: {} };
        }
        if (sql.includes('FROM camera_registry')) {
          const rows = tables.get('camera_registry') ?? [];
          let filtered = rows;
          if (boundValues.length > 0) {
            filtered = rows.filter(r => r.store_id === boundValues[0]);
          }
          return { results: filtered, success: true, meta: {} };
        }
        if (sql.includes('FROM calibrations')) {
          const rows = tables.get('calibrations') ?? [];
          let filtered = rows;
          if (boundValues.length > 0) {
            filtered = rows.filter(r => r.store_id === boundValues[0]);
          }
          return { results: filtered, success: true, meta: {} };
        }
        return { results: [], success: true, meta: {} };
      },
      async run() {
        if (sql.includes('INSERT INTO interactions')) {
          tables.get('interactions')!.push({
            id: boundValues[0],
            store_id: boundValues[1],
            session_start: boundValues[2],
            session_end: boundValues[3],
            summary: boundValues[4],
            referenced_interactions: boundValues[5],
            created_at: boundValues[6],
          });
        } else if (sql.includes('INSERT INTO time_period_analyses')) {
          tables.get('time_period_analyses')!.push({
            id: boundValues[0],
            interaction_id: boundValues[1],
            period_start: boundValues[2],
            analysis: boundValues[3],
            created_at: boundValues[4],
          });
        } else if (sql.includes('INSERT INTO calibrations')) {
          tables.get('calibrations')!.push({
            id: boundValues[0],
            store_id: boundValues[1],
            date: boundValues[2],
            session_id: boundValues[3],
            reasoning: boundValues[4],
            adjustments: boundValues[5],
            applied: boundValues[6],
            created_at: boundValues[7],
          });
        } else if (sql.includes('INSERT INTO camera_registry')) {
          tables.get('camera_registry')!.push({
            id: boundValues[0],
            store_id: boundValues[1],
            camera_id: boundValues[2],
            zone: boundValues[3],
            grid_row: boundValues[4],
            grid_col: boundValues[5],
            adjacency: boundValues[6],
            updated_at: boundValues[7],
          });
        } else if (sql.includes('UPDATE camera_registry')) {
          const rows = tables.get('camera_registry') ?? [];
          const target = rows.find(
            r => r.store_id === boundValues[2] && r.camera_id === boundValues[3]
          );
          if (target) {
            target.adjacency = boundValues[0];
            target.updated_at = boundValues[1];
          }
        }
        return { success: true, meta: {} };
      },
      async raw() {
        return [];
      },
    } as unknown as D1PreparedStatement;
    return stmt;
  };

  return {
    prepare: createStatement,
    async batch(statements: D1PreparedStatement[]) {
      const results = [];
      for (const stmt of statements) {
        results.push(await stmt.run());
      }
      return results;
    },
    async exec() {
      return { count: 0, duration: 0 };
    },
    dump: async () => new ArrayBuffer(0),
  } as unknown as D1Database;
}

export function createMockEmbeddings(
  existingMatches?: VectorMatch[]
): EmbeddingClient & {
  embedded: Array<{ id: string; metadata: VectorMetadata }>;
  queries: Array<{ storeId: string; text: string }>;
} {
  const mock = {
    embedded: [] as Array<{ id: string; metadata: VectorMetadata }>,
    queries: [] as Array<{ storeId: string; text: string }>,

    async embed(_text: string): Promise<number[]> {
      // Return fake 768-dim vector
      return Array.from({ length: 768 })
        .fill(0)
        .map((_, i) => Math.sin(i));
    },

    async query(
      storeId: string,
      text: string,
      _topK: number,
      _excludeSessionStart?: number
    ): Promise<VectorMatch[]> {
      mock.queries.push({ storeId, text });
      return existingMatches ?? [];
    },

    async insert(
      id: string,
      _values: number[],
      metadata: VectorMetadata
    ): Promise<void> {
      mock.embedded.push({ id, metadata });
    },
  };
  return mock;
}

export function createMockVectorize(): VectorizeIndex {
  return {
    query: async () => ({ matches: [], count: 0 }),
    upsert: async () => ({ mutationId: 'mock' }),
    insert: async () => ({ mutationId: 'mock' }),
    deleteByIds: async () => ({ mutationId: 'mock' }),
    getByIds: async () => [],
    describe: async () => ({
      vectorsCount: 0,
      dimensionCount: 768,
      config: { dimensions: 768, metric: 'cosine' as const },
    }),
  } as unknown as VectorizeIndex;
}

export function createMockAI(): Ai {
  return {
    run: async () => ({ data: [Array.from({ length: 768 }).fill(0)] }),
  } as unknown as Ai;
}

export function createMockEnv(overrides?: Partial<Environment>): Environment {
  return {
    DB: createMockD1(),
    INGEST_FRAMES: createMockR2(),
    VECTORIZE: createMockVectorize(),
    AI: createMockAI(),
    AUTH_TOKEN: 'test-token',
    GEMINI_API_KEY: 'test-gemini-key',
    AXIOM_API_TOKEN: 'test-axiom',
    AXIOM_DATASET: 'test-dataset',
    ...overrides,
  };
}

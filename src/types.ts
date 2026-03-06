import { z } from 'zod';

export interface Environment {
  DB: D1Database;
  INGEST_FRAMES: R2Bucket;
  VECTORIZE: VectorizeIndex;
  AI: Ai;
  AUTH_TOKEN: string;
  GEMINI_API_KEY: string;
  AXIOM_API_TOKEN: string;
  AXIOM_DATASET: string;
}

export const SessionJobSchema = z.object({
  store_id: z.string().min(1),
  session_start: z.number().int().positive(),
  session_end: z.number().int().positive(),
});

export type SessionJob = z.infer<typeof SessionJobSchema>;

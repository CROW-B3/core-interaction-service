import { z } from '@hono/zod-openapi';

export interface Environment {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
  AI: Ai;
  WEB_INGEST_SERVICE_URL: string;
  ENVIRONMENT: string;
  AXIOM_API_TOKEN: string;
  AXIOM_DATASET: string;
}

// Queue message types
export interface SessionProcessingMessage {
  sessionId: string;
  expiredAt: string;
  timestamp: string;
}

// Session export response from web-ingest-service
export interface SessionExportResponse {
  success: boolean;
  data: {
    session: SessionData;
    events: SessionEvent[];
    replayChunks: ReplayChunkMeta[];
  };
}

export interface SessionData {
  id: string;
  startedAt: number;
  endedAt: number | null;
  durationInMilliseconds: number | null;
  referrer: string | null;
  initialUrl: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  country: string | null;
  deviceType: string | null;
  browser: string | null;
  operatingSystem: string | null;
  hasReplay: boolean;
  exitContext: ExitContext | null;
}

export interface ExitContext {
  exitPage?: string;
  exitTrigger?: string;
  lastInteractions?: Array<{
    type: string;
    target?: string;
    timestamp?: number;
  }>;
}

export interface SessionEvent {
  id: string;
  sessionId: string;
  type: string;
  url: string;
  timestamp: number;
  data: Record<string, unknown> | null;
  createdAt: number;
}

export interface ReplayChunkMeta {
  id: string;
  chunkIndex: number;
  r2Key: string;
  eventCount: number;
  sizeBytes: number;
  startTimestamp: number;
  endTimestamp: number;
}

// Preprocessing types
export interface PageWindow {
  url: string;
  enterTimestamp: number;
  exitTimestamp: number;
  timeSpentMs: number;
  events: SessionEvent[];
  eventCounts: Record<string, number>;
  scrollDepth: number;
  engagementScore: number;
  idleGaps: Array<{ start: number; end: number; durationMs: number }>;
}

export interface NormalizedTimeline {
  pages: PageWindow[];
  navigationSequence: string[];
  totalDurationMs: number;
  totalEvents: number;
}

// AI analysis output types
export interface JourneyAnalysis {
  summary: string;
  intent: string;
  journeyType: string;
  keyActions: string[];
  frictionPoints: string[];
  satisfactionIndicators: string[];
  confidence: number;
}

export interface PageAnalysis {
  url: string;
  purpose: string;
  interactions: string[];
  timeSpentMs: number;
  engagementLevel: string;
  issues: string[];
}

export interface ExitAnalysis {
  exitPage: string;
  exitReason: string;
  exitType: string;
  lastActions: string[];
  suggestions: string[];
  confidence: number;
}

export interface AnalysisResult {
  journeyAnalysis: JourneyAnalysis;
  pageAnalyses: PageAnalysis[];
  exitAnalysis: ExitAnalysis;
  summary: string;
  confidence: number;
  tags: string[];
}

// OpenAPI schemas
export const HelloWorldSchema = z
  .object({
    text: z.string(),
  })
  .openapi('User');

export const AnalysisResponseSchema = z
  .object({
    success: z.boolean(),
    data: z
      .object({
        id: z.string(),
        sessionId: z.string(),
        status: z.string(),
        journeyAnalysis: z.any().nullable(),
        pageAnalyses: z.any().nullable(),
        exitAnalysis: z.any().nullable(),
        summary: z.string().nullable(),
        confidence: z.number().nullable(),
        tags: z.any().nullable(),
        eventCount: z.number().nullable(),
        replayChunkCount: z.number().nullable(),
        processingDurationMs: z.number().nullable(),
        modelUsed: z.string().nullable(),
        errorMessage: z.string().nullable(),
        createdAt: z.number(),
        processedAt: z.number().nullable(),
      })
      .nullable(),
  })
  .openapi('AnalysisResponse');

export const AnalysisStatsSchema = z
  .object({
    success: z.boolean(),
    data: z.object({
      total: z.number(),
      pending: z.number(),
      processing: z.number(),
      completed: z.number(),
      failed: z.number(),
    }),
  })
  .openapi('AnalysisStats');

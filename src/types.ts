export interface Environment {
  DB: D1Database;
  ENVIRONMENT: 'local' | 'dev' | 'prod';
  INTERACTION_ANALYZER: DurableObjectNamespace;
  INTERACTION_VECTORIZE: VectorizeIndex;
  INTERACTION_QUEUE: Queue<InteractionMessage>;
  CCTV_QUEUE: Queue<CctvBatchQueueMessage>;
  AUTH_SERVICE_URL: string;
  PRODUCT_SERVICE_URL: string;
  WEB_INGEST_SERVICE_URL: string;
  AI_GATEWAY_ID: string;
  SYSTEM_SECRET: string;
  INTERNAL_GATEWAY_KEY?: string;
  AI: Ai;
  R2_BUCKET: R2Bucket;
}

export interface InteractionMessage {
  organizationId: string | null;
  sourceType: 'web' | 'cctv' | 'social';
  sessionId?: string;
  data: string;
  summary?: string;
  timestamp: number;
}

export interface SessionExpiryMessage {
  sessionId: string;
  expiredAt: string;
}

export interface FrameAnalysisResult {
  frameIndex: number;
  timestamp: number;
  description: string;
}

export interface CctvBatchQueueMessage {
  organizationId: string;
  sourceType: 'cctv';
  sessionId: string;
  cameraId: string;
  batchIndex: number;
  frameAnalyses: FrameAnalysisResult[];
  batchStartTimestamp: number;
  batchEndTimestamp: number;
}

export interface ProductCatalogItem {
  id: string;
  name: string;
  description?: string;
  category?: string;
}

export interface ProductInteraction {
  productId: string;
  type: string;
}

export interface StructuredCctvInteraction {
  behavior: string;
  peopleCount: number;
  productInteractions: ProductInteraction[];
  confidence: number;
  tags: string[];
}

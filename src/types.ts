export interface Environment {
  DB: D1Database;
  ENVIRONMENT: 'local' | 'dev' | 'prod';
  INTERACTION_ANALYZER: DurableObjectNamespace;
  INTERACTION_QUEUE: Queue<InteractionMessage>;
  AUTH_SERVICE_URL: string;
  SYSTEM_SECRET: string;
}

export interface InteractionMessage {
  organizationId: string;
  sourceType: 'web' | 'cctv' | 'social';
  sessionId?: string;
  data: string;
  summary?: string;
  timestamp: number;
}

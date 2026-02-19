export interface Environment {
  DB: D1Database;
  ENVIRONMENT: 'local' | 'dev' | 'prod';
}

export interface InteractionMessage {
  organizationId: string;
  sourceType: 'web' | 'cctv' | 'social';
  sessionId?: string;
  data: string;
  summary?: string;
  timestamp: number;
}

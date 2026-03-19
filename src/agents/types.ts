export interface SessionEvent {
  type: string;
  url: string;
  timestamp: number;
  data?: Record<string, any>;
  userAgent?: string;
  screenSize?: { width: number; height: number };
}

export interface AgentInsight {
  category: string;
  observation: string;
  evidence: string[];
  severity: 'info' | 'warning' | 'critical';
  confidence: number;
  recommendations?: string[];
}

export interface AgentResult {
  agentName: string;
  analysisTime: number;
  insights: AgentInsight[];
  rawAnalysis: string;
}

export interface MultiAgentAnalysisResult {
  sessionId: string;
  totalAnalysisTime: number;
  agentResults: AgentResult[];
  synthesizedInsights: AgentInsight[];
  executiveSummary: string;
  keyFindings: string[];
  prioritizedRecommendations: string[];
}

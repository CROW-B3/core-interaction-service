export const LLAMA_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// --- Payload from DO ---

export interface SessionAnalysisPayload {
  sessionId: string;
  projectId: string;
  userId?: string;
  anonymousId?: string;
  events: SessionEvent[];
  metadata: SessionMetadata;
}

export interface SessionEvent {
  type: string;
  timestamp: number;
  url?: string;
  data?: Record<string, unknown> | null;
  userAgent?: string;
  screenSize?: { width: number; height: number } | null;
}

export interface SessionMetadata {
  userAgent: string;
  browser: string;
  deviceType: string;
  operatingSystem: string;
  initialUrl: string;
  referrer: string | null;
  startedAt: string;
  endedAt: string | null;
}

// --- DOM Chunker ---

export interface PageDomSummary {
  url: string;
  title: string;
  purpose: string;
  visibleContent: string;
  interactiveElements: { tag: string; text: string }[];
  productElements: { name?: string; price?: string; stock?: string }[];
  errorIndicators: string[];
  formFields: string[];
}

// --- Preprocessor ---

export interface PageVisit {
  url: string;
  entryTimestamp: number;
  exitTimestamp: number;
  timeOnPageMs: number;
  domSummary?: PageDomSummary;
  interactions: PageInteraction[];
}

export interface PageInteraction {
  type: string;
  timestamp: number;
  detail?: string;
  elementContext?: {
    tag?: string;
    text?: string;
    id?: string;
    className?: string;
    ariaLabel?: string;
    href?: string;
    domPath?: string;
  };
}

export interface ExitContext {
  lastEvents: SessionEvent[];
  lastPage: string;
  lastAction: string;
  cartState?: Record<string, unknown>;
  lastDomSummary?: PageDomSummary;
}

export interface PerformanceMetrics {
  lcp?: number;
  fid?: number;
  cls?: number;
  ttfb?: number;
}

export interface NavigationPattern {
  type: 'linear' | 'back_and_forth' | 'loop' | 'bounce';
  description: string;
  urls: string[];
}

export interface UserJourneyNarrative {
  steps: JourneyStep[];
  pattern: NavigationPattern;
  revisitedPages: { url: string; visitCount: number }[];
  totalPagesVisited: number;
  uniquePagesVisited: number;
}

export interface JourneyStep {
  stepNumber: number;
  url: string;
  pageTitle?: string;
  pagePurpose?: string;
  timeOnPageMs: number;
  keyActions: string[];
  domContentSeen?: string;
  productsViewed?: { name?: string; price?: string; stock?: string }[];
  exitAction?: string;
}

export interface PreprocessedSession {
  sessionId: string;
  projectId: string;
  userId?: string;
  anonymousId?: string;
  metadata: SessionMetadata;
  durationMs: number;
  journey: PageVisit[];
  journeyNarrative: UserJourneyNarrative;
  exitContext: ExitContext;
  performance: PerformanceMetrics;
  errors: SessionEvent[];
  rageClicks: SessionEvent[];
  apiErrors: SessionEvent[];
  ecommerceEvents: SessionEvent[];
  eventCounts: Record<string, number>;
  totalEventCount: number;
  pageDomSummaries: PageDomSummary[];
}

// --- Classifier ---

export type SessionLayer = 'deterministic' | 'behavioral' | 'dead';

// --- Deterministic Detector ---

export interface DeterministicIssue {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  url?: string;
  timestamp?: number;
  metric?: number;
}

// --- Agent Results ---

export interface AgentFinding {
  observation: string;
  evidence: string;
  significance: 'high' | 'medium' | 'low';
}

export interface AgentResult {
  agentName: string;
  findings: AgentFinding[];
  confidence: number;
  tags: string[];
}

export interface WhyConclusion {
  why: string;
  confidence: number;
  category: string;
  supportingEvidence: string[];
  recommendations: string[];
  journeyEvidence?: string;
}

export interface SynthesisResult extends AgentResult {
  whyConclusions: WhyConclusion[];
}

export interface RedTeamChallenge {
  originalWhy: string;
  challenge: string;
  alternativeExplanation: string;
  adjustedConfidence: number;
  biasIdentified?: string;
}

export interface RedTeamResult extends AgentResult {
  challenges: RedTeamChallenge[];
  finalWhys: WhyConclusion[];
}

export interface AnalysisPipelineResult {
  sessionId: string;
  projectId: string;
  layer: SessionLayer;
  deterministicIssues: DeterministicIssue[];
  agentResults: AgentResult[];
  synthesis?: SynthesisResult;
  redTeamReview?: RedTeamResult;
  finalWhys: WhyConclusion[];
  overallConfidence: number;
  processingTimeMs: number;
}

// --- AI Helper ---

export function parseJsonFromLlm<T>(responseText: string): T | null {
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]) as T;
  } catch {
    return null;
  }
}

export async function runAiPrompt(
  ai: Ai,
  prompt: string,
  maxTokens: number = 512
): Promise<string> {
  try {
    const result = await ai.run(LLAMA_MODEL as any, {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
    });
    const output = result as { response?: string } | string;
    return typeof output === 'string' ? output : (output?.response ?? '');
  } catch (err) {
    console.error('AI prompt failed:', err);
    return '';
  }
}

export function buildFallbackAgentResult(agentName: string): AgentResult {
  return {
    agentName,
    findings: [],
    confidence: 0.1,
    tags: ['agent-failed'],
  };
}

export function buildJourneyNarrativeText(
  session: PreprocessedSession
): string {
  const narrative = session.journeyNarrative;
  if (!narrative || narrative.steps.length === 0) return 'No journey data.';

  const stepsText = narrative.steps
    .map(step => {
      const timeStr = `${Math.round(step.timeOnPageMs / 1000)}s`;
      const title = step.pageTitle ? ` "${step.pageTitle}"` : '';
      const purpose = step.pagePurpose ? ` (${step.pagePurpose})` : '';
      const products =
        step.productsViewed && step.productsViewed.length > 0
          ? `\n     Products seen: ${step.productsViewed.map(p => `${p.name ?? 'unknown'} ${p.price ? `at ${p.price}` : ''} ${p.stock ? `[${p.stock}]` : ''}`).join(', ')}`
          : '';
      const actions =
        step.keyActions.length > 0
          ? `\n     Actions: ${step.keyActions.join(' → ')}`
          : '\n     Actions: none (passive viewing)';
      const content = step.domContentSeen
        ? `\n     Visible content: ${step.domContentSeen.slice(0, 200)}`
        : '';
      const exit = step.exitAction
        ? `\n     Left after: ${step.exitAction}`
        : '';

      return `  Step ${step.stepNumber}: ${step.url}${title}${purpose} [${timeStr}]${products}${actions}${content}${exit}`;
    })
    .join('\n\n');

  const patternText = `Navigation pattern: ${narrative.pattern.type} - ${narrative.pattern.description}`;
  const revisitText =
    narrative.revisitedPages.length > 0
      ? `\nRevisited pages: ${narrative.revisitedPages.map(r => `${r.url} (${r.visitCount}x)`).join(', ')}`
      : '';
  const statsText = `\nPages: ${narrative.totalPagesVisited} total, ${narrative.uniquePagesVisited} unique`;

  return `${patternText}${revisitText}${statsText}\n\nUser Journey:\n${stepsText}`;
}

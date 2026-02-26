import type {
  AnalysisResult,
  ExitAnalysis,
  JourneyAnalysis,
  PageAnalysis,
} from '../types';

const DEFAULT_JOURNEY_ANALYSIS: JourneyAnalysis = {
  summary: '',
  intent: 'unknown',
  journeyType: 'unknown',
  keyActions: [],
  frictionPoints: [],
  satisfactionIndicators: [],
  confidence: 0,
};

const DEFAULT_EXIT_ANALYSIS: ExitAnalysis = {
  exitPage: '',
  exitReason: 'unknown',
  exitType: 'unknown',
  lastActions: [],
  suggestions: [],
  confidence: 0,
};

/**
 * Attempts to parse a raw string as JSON.
 * Tries three strategies in order:
 *  1. Direct JSON.parse
 *  2. Extract JSON from a markdown ```json ... ``` code block
 *  3. Regex: find the first `{` to the last `}` and parse that substring
 */
function extractJSON(raw: string): unknown {
  // Strategy 1: direct parse
  try {
    return JSON.parse(raw);
  } catch {
    // continue
  }

  // Strategy 2: markdown code block
  const codeBlockMatch = raw.match(/```json([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // continue
    }
  }

  // Strategy 3: first `{` to last `}`
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    } catch {
      // continue
    }
  }

  throw new Error('Failed to extract valid JSON from AI response');
}

/**
 * Ensures a value is a string array. Non-array values become an empty array;
 * non-string elements are filtered out.
 */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

/**
 * Ensures a value is a finite number. Falls back to the provided default.
 */
function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return fallback;
}

/**
 * Ensures a value is a string. Falls back to the provided default.
 */
function toString(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    return value;
  }
  return fallback;
}

/**
 * Maps a raw AI response object to a typed JourneyAnalysis,
 * converting snake_case keys to camelCase and applying defaults.
 */
export function mapJourneyAnalysis(raw: any): JourneyAnalysis {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_JOURNEY_ANALYSIS };
  }

  return {
    summary: toString(raw.summary, DEFAULT_JOURNEY_ANALYSIS.summary),
    intent: toString(raw.intent, DEFAULT_JOURNEY_ANALYSIS.intent),
    journeyType: toString(
      raw.journey_type ?? raw.journeyType,
      DEFAULT_JOURNEY_ANALYSIS.journeyType
    ),
    keyActions: toStringArray(raw.key_actions ?? raw.keyActions),
    frictionPoints: toStringArray(raw.friction_points ?? raw.frictionPoints),
    satisfactionIndicators: toStringArray(
      raw.satisfaction_indicators ?? raw.satisfactionIndicators
    ),
    confidence: toNumber(raw.confidence, DEFAULT_JOURNEY_ANALYSIS.confidence),
  };
}

/**
 * Maps a raw AI response object to a typed PageAnalysis,
 * converting snake_case keys to camelCase and applying defaults.
 */
export function mapPageAnalysis(raw: any): PageAnalysis {
  if (!raw || typeof raw !== 'object') {
    return {
      url: '',
      purpose: '',
      interactions: [],
      timeSpentMs: 0,
      engagementLevel: 'low',
      issues: [],
    };
  }

  return {
    url: toString(raw.url, ''),
    purpose: toString(raw.purpose, ''),
    interactions: toStringArray(raw.interactions),
    timeSpentMs: toNumber(raw.time_spent_ms ?? raw.timeSpentMs, 0),
    engagementLevel: toString(
      raw.engagement_level ?? raw.engagementLevel,
      'low'
    ),
    issues: toStringArray(raw.issues),
  };
}

/**
 * Maps a raw AI response object to a typed ExitAnalysis,
 * converting snake_case keys to camelCase and applying defaults.
 */
export function mapExitAnalysis(raw: any): ExitAnalysis {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_EXIT_ANALYSIS };
  }

  return {
    exitPage: toString(
      raw.exit_page ?? raw.exitPage,
      DEFAULT_EXIT_ANALYSIS.exitPage
    ),
    exitReason: toString(
      raw.exit_reason ?? raw.exitReason,
      DEFAULT_EXIT_ANALYSIS.exitReason
    ),
    exitType: toString(
      raw.exit_type ?? raw.exitType,
      DEFAULT_EXIT_ANALYSIS.exitType
    ),
    lastActions: toStringArray(raw.last_actions ?? raw.lastActions),
    suggestions: toStringArray(raw.suggestions),
    confidence: toNumber(raw.confidence, DEFAULT_EXIT_ANALYSIS.confidence),
  };
}

/**
 * Parses a raw AI text response into a typed AnalysisResult.
 *
 * The function tries multiple JSON extraction strategies, maps snake_case keys
 * from the AI response to camelCase TypeScript types, and fills in defaults for
 * any missing fields.
 */
export function parseAIResponse(rawResponse: string): AnalysisResult {
  const parsed = extractJSON(rawResponse) as Record<string, any>;

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Parsed AI response is not an object');
  }

  // Map each section, preferring snake_case keys from the AI response
  const journeyAnalysis = mapJourneyAnalysis(
    parsed.journey_analysis ?? parsed.journeyAnalysis
  );

  const rawPages = parsed.page_analyses ?? parsed.pageAnalyses;
  const pageAnalyses: PageAnalysis[] = Array.isArray(rawPages)
    ? rawPages.map(mapPageAnalysis)
    : [];

  const exitAnalysis = mapExitAnalysis(
    parsed.exit_analysis ?? parsed.exitAnalysis
  );

  // Derive summary from journey analysis
  const summary = journeyAnalysis.summary || '';

  // Derive confidence as the average of journey and exit confidence
  const confidence = (journeyAnalysis.confidence + exitAnalysis.confidence) / 2;

  // Derive tags from journeyType and exitType
  const tags: string[] = [];
  if (
    journeyAnalysis.journeyType &&
    journeyAnalysis.journeyType !== 'unknown'
  ) {
    tags.push(journeyAnalysis.journeyType);
  }
  if (exitAnalysis.exitType && exitAnalysis.exitType !== 'unknown') {
    tags.push(exitAnalysis.exitType);
  }

  return {
    journeyAnalysis,
    pageAnalyses,
    exitAnalysis,
    summary,
    confidence,
    tags,
  };
}

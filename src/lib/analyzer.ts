import type { Environment, SessionJob } from '../types';
import type { EmbeddingClient, VectorMatch } from './embeddings';
import type { GeminiAnalysis, GeminiClient } from './gemini';
import { extractEmbeddingText } from './embeddings';
import {
  fetchCompositeFrame,
  groupIntoPeriods,
  listCompositeKeys,
  pickRepresentativeFrame,
} from './frames';

const TIME_PERIOD_SECONDS = 300; // 5 minutes
const RAG_TOP_K = 3;

export interface PeriodResult {
  period_start: number;
  analysis: GeminiAnalysis | null;
  error?: string;
}

export interface AnalysisResult {
  interaction_id: string;
  store_id: string;
  session_start: number;
  session_end: number;
  periods: PeriodResult[];
  summary: string;
  referenced_interactions: string[];
}

function generateId(): string {
  return crypto.randomUUID();
}

function buildSessionSummary(periods: PeriodResult[]): string {
  const successful = periods.filter(p => p.analysis !== null);
  if (successful.length === 0) {
    return 'No frames were available or analyzable for this session.';
  }

  const summaries = successful.map(p => p.analysis!.summary).filter(Boolean);

  const allPeople = successful.flatMap(p => p.analysis!.people || []);
  const allEvents = successful.flatMap(p => p.analysis!.notable_events || []);

  const parts: string[] = [];
  parts.push(
    `Session covered ${successful.length} time periods (${periods.length} total, ${periods.length - successful.length} failed).`
  );

  if (allPeople.length > 0) {
    parts.push(`${allPeople.length} person observations across the session.`);
  }

  if (allEvents.length > 0) {
    parts.push(`Notable events: ${allEvents.join('; ')}`);
  }

  if (summaries.length > 0) {
    parts.push(`Period summaries: ${summaries.join(' | ')}`);
  }

  return parts.join(' ');
}

function buildPriorContextPrompt(matches: VectorMatch[]): string | null {
  if (matches.length === 0) return null;

  const lines = matches.map(
    (m, i) =>
      `[Prior session ${i + 1}, similarity ${m.score.toFixed(2)}]: ${m.metadata.summary_text}`
  );

  return `Prior context from previous sessions:\n${lines.join('\n')}`;
}

export async function analyzeSession(
  env: Environment,
  gemini: GeminiClient,
  job: SessionJob,
  embeddings?: EmbeddingClient | null
): Promise<AnalysisResult> {
  const interactionId = generateId();
  const referencedIds = new Set<string>();

  // 1. List all composite frames in the session range
  const compositeKeys = await listCompositeKeys(
    env,
    job.store_id,
    job.session_start,
    job.session_end
  );

  // Extract bucket_sec from keys
  const bucketSecs = compositeKeys
    .map(key => {
      const match = key.match(/\/(\d+)\.jpg$/);
      return match ? Number.parseInt(match[1], 10) : Number.NaN;
    })
    .filter(n => !Number.isNaN(n));

  // 2. Group into 5-minute time periods
  const periods = groupIntoPeriods(bucketSecs, TIME_PERIOD_SECONDS);
  const sortedPeriodStarts = [...periods.keys()].sort((a, b) => a - b);

  // 3. Query Vectorize for cross-session context (once, before analysis loop)
  let priorContext: string | null = null;
  if (embeddings && sortedPeriodStarts.length > 0) {
    try {
      const queryText = `Store ${job.store_id} session analysis at ${job.session_start}`;
      const matches = await embeddings.query(
        job.store_id,
        queryText,
        RAG_TOP_K,
        job.session_start // exclude current session
      );
      priorContext = buildPriorContextPrompt(matches);
      for (const m of matches) {
        referencedIds.add(m.metadata.interaction_id);
      }
    } catch (err) {
      console.error(
        `RAG query failed, continuing without prior context: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  // 4. Sequential analysis with context chaining
  const results: PeriodResult[] = [];
  let previousSummary: string | null = null;

  for (const periodStart of sortedPeriodStarts) {
    const periodBuckets = periods.get(periodStart)!;
    const representativeSec = pickRepresentativeFrame(periodBuckets);

    try {
      const frameBytes = await fetchCompositeFrame(
        env,
        job.store_id,
        representativeSec
      );

      if (!frameBytes) {
        results.push({
          period_start: periodStart,
          analysis: null,
          error: `No composite frame found for bucket_sec ${representativeSec}`,
        });
        continue;
      }

      const base64 = btoa(String.fromCharCode(...frameBytes));

      // Build combined context: prior sessions + previous period
      let combinedContext = previousSummary;
      if (priorContext && periodStart === sortedPeriodStarts[0]) {
        // Inject prior session context only for the first period
        combinedContext =
          priorContext + (previousSummary ? `\n\n${previousSummary}` : '');
      }

      const analysis = await gemini.analyzeFrame(base64, combinedContext);

      results.push({ period_start: periodStart, analysis });
      previousSummary = analysis.summary;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Period ${periodStart} analysis failed: ${message}`);
      results.push({
        period_start: periodStart,
        analysis: null,
        error: message,
      });
    }
  }

  // 5. Build session-level summary
  const summary = buildSessionSummary(results);

  return {
    interaction_id: interactionId,
    store_id: job.store_id,
    session_start: job.session_start,
    session_end: job.session_end,
    periods: results,
    summary,
    referenced_interactions: [...referencedIds],
  };
}

export async function persistAnalysis(
  db: D1Database,
  result: AnalysisResult
): Promise<void> {
  const now = new Date().toISOString();

  const statements: D1PreparedStatement[] = [];

  statements.push(
    db
      .prepare(
        `INSERT INTO interactions (id, store_id, session_start, session_end, summary, referenced_interactions, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        result.interaction_id,
        result.store_id,
        result.session_start,
        result.session_end,
        JSON.stringify({
          text: result.summary,
          periods_analyzed: result.periods.filter(p => p.analysis).length,
          periods_failed: result.periods.filter(p => !p.analysis).length,
          total_periods: result.periods.length,
        }),
        result.referenced_interactions.length > 0
          ? JSON.stringify(result.referenced_interactions)
          : null,
        now
      )
  );

  for (const period of result.periods) {
    statements.push(
      db
        .prepare(
          `INSERT INTO time_period_analyses (id, interaction_id, period_start, analysis, created_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          result.interaction_id,
          period.period_start,
          JSON.stringify(period.analysis ?? { error: period.error }),
          now
        )
    );
  }

  await db.batch(statements);
}

/**
 * Embed the interaction into Vectorize (best-effort, post-persist).
 */
export async function embedInteraction(
  embeddings: EmbeddingClient,
  result: AnalysisResult,
  summaryJson: string
): Promise<void> {
  const text = extractEmbeddingText(result.summary, summaryJson);
  const vector = await embeddings.embed(text);
  await embeddings.insert(result.interaction_id, vector, {
    store_id: result.store_id,
    session_start: result.session_start,
    interaction_id: result.interaction_id,
    summary_text: result.summary.slice(0, 500),
  });
}

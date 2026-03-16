import type { GeminiClient } from './gemini';

const AUTO_APPLY_THRESHOLD = 0.8;

export interface CameraEntry {
  id: string;
  store_id: string;
  camera_id: string;
  zone: string | null;
  grid_row: number;
  grid_col: number;
  adjacency: Record<string, string> | null;
  updated_at: string;
}

export interface CalibrationAdjustment {
  camera_id: string;
  action: 'swap' | 'move' | 'set_adjacency';
  details: Record<string, unknown>;
}

export interface CalibrationResult {
  id: string;
  store_id: string;
  date: string;
  session_id: string | null;
  reasoning: {
    analysis: string;
    adjacency_map: Record<string, string[]>;
    confidence: number;
    prior_evaluation?: string;
  };
  adjustments: CalibrationAdjustment[];
  applied: boolean;
}

const CALIBRATION_PROMPT = `You are analyzing CCTV interaction data to evaluate camera spatial layout in a retail store.

Given the interaction analyses (showing people's movements across camera tiles), the current camera registry (grid positions and adjacency), and any prior calibration reasoning:

1. Evaluate which cameras show adjacent physical spaces based on people moving between tiles
2. Identify any cameras that appear misaligned in the grid
3. Suggest specific adjustments (swaps, adjacency updates)
4. Rate your confidence in the adjustments (0.0 to 1.0)

Respond ONLY with valid JSON:
{
  "analysis": "string - your reasoning about the spatial layout",
  "adjacency_map": { "cam_id": ["adjacent_cam_1", "adjacent_cam_2"] },
  "confidence": 0.0-1.0,
  "prior_evaluation": "string - evaluation of prior calibration decisions (if any)",
  "adjustments": [
    {
      "camera_id": "string",
      "action": "swap|move|set_adjacency",
      "details": { ... }
    }
  ]
}`;

export async function findBusiestSession(
  db: D1Database,
  storeId: string,
  date: string
): Promise<{
  session_id: string;
  session_start: number;
  session_end: number;
  frame_count: number;
} | null> {
  // Date is YYYY-MM-DD. Convert to unix range for the day.
  const dayStart = Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
  const dayEnd = dayStart + 86400;

  // Query interactions for this store within the date range, ordered by period count
  const result = await db
    .prepare(
      `SELECT id, store_id, session_start, session_end, summary
       FROM interactions
       WHERE store_id = ? AND session_start >= ? AND session_start < ?
       ORDER BY session_start DESC
       LIMIT 50`
    )
    .bind(storeId, dayStart, dayEnd)
    .all();

  if (!result.results || result.results.length === 0) return null;

  // Pick the one with most periods analyzed
  let best: {
    session_id: string;
    session_start: number;
    session_end: number;
    frame_count: number;
  } | null = null;
  for (const row of result.results) {
    try {
      const summary = JSON.parse(row.summary as string);
      const count = summary.periods_analyzed ?? summary.total_periods ?? 0;
      if (!best || count > best.frame_count) {
        best = {
          session_id: row.id as string,
          session_start: row.session_start as number,
          session_end: row.session_end as number,
          frame_count: count,
        };
      }
    } catch {
      continue;
    }
  }

  return best;
}

export async function fetchSessionAnalyses(
  db: D1Database,
  interactionId: string
): Promise<Array<{ period_start: number; analysis: string }>> {
  const result = await db
    .prepare(
      `SELECT period_start, analysis FROM time_period_analyses
       WHERE interaction_id = ?
       ORDER BY period_start ASC`
    )
    .bind(interactionId)
    .all();

  return (result.results ?? []).map(r => ({
    period_start: r.period_start as number,
    analysis: r.analysis as string,
  }));
}

export async function fetchCameraRegistry(
  db: D1Database,
  storeId: string
): Promise<CameraEntry[]> {
  const result = await db
    .prepare(
      `SELECT id, store_id, camera_id, zone, grid_row, grid_col, adjacency, updated_at
       FROM camera_registry WHERE store_id = ?`
    )
    .bind(storeId)
    .all();

  return (result.results ?? []).map(r => ({
    id: r.id as string,
    store_id: r.store_id as string,
    camera_id: r.camera_id as string,
    zone: r.zone as string | null,
    grid_row: r.grid_row as number,
    grid_col: r.grid_col as number,
    adjacency: r.adjacency ? JSON.parse(r.adjacency as string) : null,
    updated_at: r.updated_at as string,
  }));
}

export async function fetchPriorCalibration(
  db: D1Database,
  storeId: string
): Promise<{ reasoning: string; date: string } | null> {
  const result = await db
    .prepare(
      `SELECT date, reasoning FROM calibrations
       WHERE store_id = ?
       ORDER BY date DESC LIMIT 1`
    )
    .bind(storeId)
    .first();

  if (!result) return null;
  return {
    date: result.date as string,
    reasoning: result.reasoning as string,
  };
}

export async function checkCalibrationExists(
  db: D1Database,
  storeId: string,
  date: string
): Promise<boolean> {
  const result = await db
    .prepare(`SELECT id FROM calibrations WHERE store_id = ? AND date = ?`)
    .bind(storeId, date)
    .first();
  return result !== null;
}

export async function runCalibration(
  db: D1Database,
  gemini: GeminiClient,
  storeId: string,
  date: string
): Promise<CalibrationResult> {
  // 1. Check idempotency
  const exists = await checkCalibrationExists(db, storeId, date);
  if (exists) {
    throw new Error(`Calibration already exists for ${storeId} on ${date}`);
  }

  // 2. Find busiest session
  const session = await findBusiestSession(db, storeId, date);
  if (!session) {
    throw new Error(`No sessions found for ${storeId} on ${date}`);
  }

  // 3. Fetch time-period analyses
  const analyses = await fetchSessionAnalyses(db, session.session_id);

  // 4. Fetch current camera registry + prior calibration
  const registry = await fetchCameraRegistry(db, storeId);
  const priorCalibration = await fetchPriorCalibration(db, storeId);

  // 5. Build prompt context
  const contextParts: string[] = [];
  contextParts.push(`Store: ${storeId}, Date: ${date}`);
  contextParts.push(
    `Session: ${session.session_id} (${analyses.length} time periods)`
  );

  if (registry.length > 0) {
    contextParts.push(
      `\nCurrent camera registry:\n${JSON.stringify(registry, null, 2)}`
    );
  } else {
    contextParts.push('\nNo camera registry configured yet.');
  }

  if (priorCalibration) {
    contextParts.push(
      `\nPrior calibration (${priorCalibration.date}):\n${priorCalibration.reasoning}`
    );
  }

  contextParts.push(
    `\nTime-period analyses:\n${analyses.map(a => `[${a.period_start}] ${a.analysis}`).join('\n')}`
  );

  const fullContext = contextParts.join('\n');

  // 6. Call Gemini
  // We use analyzeFrame with a text-only context (no image needed for calibration)
  const geminiResult = await gemini.analyzeFrame(
    // Encode a minimal placeholder — calibration is text-based
    btoa('calibration'),
    `${CALIBRATION_PROMPT}\n\n${fullContext}`
  );

  // Parse the Gemini response (it comes back as GeminiAnalysis but we need calibration format)
  // The summary field contains our structured calibration JSON
  let calibrationData: {
    analysis: string;
    adjacency_map: Record<string, string[]>;
    confidence: number;
    prior_evaluation?: string;
    adjustments: CalibrationAdjustment[];
  };

  try {
    // Gemini was asked to return calibration JSON but it went through the analyzeFrame interface
    // The raw response is in the summary or we need to re-parse
    calibrationData = {
      analysis: geminiResult.summary,
      adjacency_map: {},
      confidence: 0.5,
      adjustments: [],
      ...(typeof geminiResult === 'object' ? geminiResult : {}),
    };
  } catch {
    calibrationData = {
      analysis: geminiResult.summary,
      adjacency_map: {},
      confidence: 0,
      adjustments: [],
    };
  }

  const calibrationId = crypto.randomUUID();
  const shouldApply = calibrationData.confidence >= AUTO_APPLY_THRESHOLD;

  const result: CalibrationResult = {
    id: calibrationId,
    store_id: storeId,
    date,
    session_id: session.session_id,
    reasoning: {
      analysis: calibrationData.analysis,
      adjacency_map: calibrationData.adjacency_map,
      confidence: calibrationData.confidence,
      prior_evaluation: calibrationData.prior_evaluation,
    },
    adjustments: calibrationData.adjustments,
    applied: shouldApply,
  };

  return result;
}

export async function persistCalibration(
  db: D1Database,
  result: CalibrationResult
): Promise<void> {
  const now = new Date().toISOString();

  const statements: D1PreparedStatement[] = [];

  statements.push(
    db
      .prepare(
        `INSERT INTO calibrations (id, store_id, date, session_id, reasoning, adjustments, applied, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        result.id,
        result.store_id,
        result.date,
        result.session_id,
        JSON.stringify(result.reasoning),
        JSON.stringify(result.adjustments),
        result.applied ? 1 : 0,
        now
      )
  );

  // Auto-apply adjacency updates if confidence is high enough
  if (result.applied) {
    for (const adj of result.adjustments) {
      if (adj.action === 'set_adjacency' && adj.details.adjacency) {
        statements.push(
          db
            .prepare(
              `UPDATE camera_registry SET adjacency = ?, updated_at = ?
               WHERE store_id = ? AND camera_id = ?`
            )
            .bind(
              JSON.stringify(adj.details.adjacency),
              now,
              result.store_id,
              adj.camera_id
            )
        );
      }
    }
  }

  await db.batch(statements);
}

export async function listCalibrations(
  db: D1Database,
  storeId: string
): Promise<Array<Record<string, unknown>>> {
  const result = await db
    .prepare(
      `SELECT id, store_id, date, session_id, reasoning, adjustments, applied, created_at
       FROM calibrations WHERE store_id = ?
       ORDER BY date DESC LIMIT 50`
    )
    .bind(storeId)
    .all();

  return (result.results ?? []).map(r => ({
    ...r,
    reasoning: JSON.parse(r.reasoning as string),
    adjustments: JSON.parse(r.adjustments as string),
    applied: r.applied === 1,
  }));
}

export async function listStores(db: D1Database): Promise<string[]> {
  const result = await db
    .prepare('SELECT DISTINCT store_id FROM interactions')
    .all();
  return (result.results ?? []).map(r => r.store_id as string);
}

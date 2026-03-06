import { describe, expect, it } from 'vitest';
import {
  checkCalibrationExists,
  fetchCameraRegistry,
  findBusiestSession,
  listCalibrations,
  listStores,
  persistCalibration,
  runCalibration,
} from '../src/lib/calibrator';
import { createMockD1, createMockGemini } from './helpers';

// Helper to seed interaction data into mock D1
async function seedInteraction(
  db: D1Database,
  id: string,
  storeId: string,
  sessionStart: number,
  periodsAnalyzed: number
) {
  await db.batch([
    db
      .prepare(
        'INSERT INTO interactions (id, store_id, session_start, session_end, summary, referenced_interactions, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        id,
        storeId,
        sessionStart,
        sessionStart + 3600,
        JSON.stringify({
          text: 'Test',
          periods_analyzed: periodsAnalyzed,
          total_periods: periodsAnalyzed,
        }),
        null,
        '2026-03-05T00:00:00Z'
      ),
  ]);
}

async function seedTimePeriodAnalysis(
  db: D1Database,
  interactionId: string,
  periodStart: number,
  analysis: string
) {
  await db.batch([
    db
      .prepare(
        'INSERT INTO time_period_analyses (id, interaction_id, period_start, analysis, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(
        crypto.randomUUID(),
        interactionId,
        periodStart,
        analysis,
        '2026-03-05T00:00:00Z'
      ),
  ]);
}

async function seedCamera(
  db: D1Database,
  storeId: string,
  cameraId: string,
  row: number,
  col: number
) {
  await db.batch([
    db
      .prepare(
        'INSERT INTO camera_registry (id, store_id, camera_id, zone, grid_row, grid_col, adjacency, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        crypto.randomUUID(),
        storeId,
        cameraId,
        null,
        row,
        col,
        null,
        '2026-03-05T00:00:00Z'
      ),
  ]);
}

describe('findBusiestSession', () => {
  it('finds the session with most periods on a given date', async () => {
    const db = createMockD1();

    // 2026-03-05 = unix 1772870400
    const dayStart = Math.floor(
      new Date('2026-03-05T00:00:00Z').getTime() / 1000
    );

    await seedInteraction(db, 'int-1', 'store1', dayStart, 5);
    await seedInteraction(db, 'int-2', 'store1', dayStart + 3600, 12);
    await seedInteraction(db, 'int-3', 'store1', dayStart + 7200, 8);

    const result = await findBusiestSession(db, 'store1', '2026-03-05');
    expect(result).not.toBeNull();
    expect(result!.session_id).toBe('int-2');
    expect(result!.frame_count).toBe(12);
  });

  it('returns null when no sessions exist', async () => {
    const db = createMockD1();
    const result = await findBusiestSession(db, 'store1', '2026-03-05');
    expect(result).toBeNull();
  });
});

describe('fetchCameraRegistry', () => {
  it('returns cameras for a store', async () => {
    const db = createMockD1();
    await seedCamera(db, 'store1', 'cam1', 0, 0);
    await seedCamera(db, 'store1', 'cam2', 0, 1);

    const cameras = await fetchCameraRegistry(db, 'store1');
    expect(cameras.length).toBe(2);
    expect(cameras[0].camera_id).toBe('cam1');
  });

  it('returns empty for unknown store', async () => {
    const db = createMockD1();
    const cameras = await fetchCameraRegistry(db, 'unknown');
    expect(cameras.length).toBe(0);
  });
});

describe('checkCalibrationExists', () => {
  it('returns false when no calibration exists', async () => {
    const db = createMockD1();
    const exists = await checkCalibrationExists(db, 'store1', '2026-03-05');
    expect(exists).toBe(false);
  });
});

describe('runCalibration', () => {
  it('runs calibration and produces result', async () => {
    const db = createMockD1();
    const gemini = createMockGemini();

    const dayStart = Math.floor(
      new Date('2026-03-05T00:00:00Z').getTime() / 1000
    );
    await seedInteraction(db, 'int-1', 'store1', dayStart, 10);
    await seedTimePeriodAnalysis(
      db,
      'int-1',
      dayStart,
      JSON.stringify({
        people: [
          { description: 'Person A', location: 'tile 1', activity: 'walking' },
        ],
        movement_patterns: ['Person moved from tile 1 to tile 2'],
        summary: 'Person observed moving between cameras.',
      })
    );
    await seedCamera(db, 'store1', 'cam1', 0, 0);
    await seedCamera(db, 'store1', 'cam2', 0, 1);

    const result = await runCalibration(db, gemini, 'store1', '2026-03-05');

    expect(result.store_id).toBe('store1');
    expect(result.date).toBe('2026-03-05');
    expect(result.session_id).toBe('int-1');
    expect(result.reasoning).toBeDefined();
    expect(result.reasoning.analysis).toBeDefined();
    expect(result.id).toBeDefined();
  });

  it('throws when no sessions found for date', async () => {
    const db = createMockD1();
    const gemini = createMockGemini();

    await expect(
      runCalibration(db, gemini, 'store1', '2026-03-05')
    ).rejects.toThrow('No sessions found');
  });

  it('throws when calibration already exists (idempotent)', async () => {
    const db = createMockD1();
    const gemini = createMockGemini();

    const dayStart = Math.floor(
      new Date('2026-03-05T00:00:00Z').getTime() / 1000
    );
    await seedInteraction(db, 'int-1', 'store1', dayStart, 10);

    // Run first calibration
    const result = await runCalibration(db, gemini, 'store1', '2026-03-05');
    await persistCalibration(db, result);

    // Second run should throw
    await expect(
      runCalibration(db, gemini, 'store1', '2026-03-05')
    ).rejects.toThrow('already exists');
  });
});

describe('persistCalibration', () => {
  it('writes calibration to D1', async () => {
    const db = createMockD1();

    await persistCalibration(db, {
      id: 'cal-1',
      store_id: 'store1',
      date: '2026-03-05',
      session_id: 'int-1',
      reasoning: {
        analysis: 'Cameras appear correctly positioned.',
        adjacency_map: { cam1: ['cam2'] },
        confidence: 0.6,
      },
      adjustments: [],
      applied: false,
    });

    const calibrations = await listCalibrations(db, 'store1');
    expect(calibrations.length).toBe(1);
    expect(calibrations[0].id).toBe('cal-1');
    expect((calibrations[0].reasoning as any).confidence).toBe(0.6);
    expect(calibrations[0].applied).toBe(false);
  });
});

describe('listStores', () => {
  it('returns distinct store IDs from interactions', async () => {
    const db = createMockD1();

    const dayStart = Math.floor(
      new Date('2026-03-05T00:00:00Z').getTime() / 1000
    );
    await seedInteraction(db, 'int-1', 'store1', dayStart, 5);
    await seedInteraction(db, 'int-2', 'store2', dayStart, 8);
    await seedInteraction(db, 'int-3', 'store1', dayStart + 3600, 3);

    const stores = await listStores(db);
    expect(stores.sort()).toEqual(['store1', 'store2']);
  });
});

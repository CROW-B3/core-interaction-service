import type { Environment } from '../types';

export interface FrameRecord {
  store_id: string;
  camera_id: string;
  bucket_sec: number;
  quality: string;
  r2_key: string;
}

/**
 * Query ingest service's D1 (via the core service's own D1 — assumes frames
 * table is replicated or accessible) for frames in a session range.
 *
 * In practice, we query R2 directly using known key patterns.
 * Frames are at: frames/{store_id}/{camera_id}/{bucket_sec}_{quality}.jpg
 * Composites are at: composites/{store_id}/{bucket_sec}.jpg
 */
export async function fetchCompositeFrame(
  env: Pick<Environment, 'INGEST_FRAMES'>,
  storeId: string,
  bucketSec: number
): Promise<Uint8Array | null> {
  const key = `composites/${storeId}/${bucketSec}.jpg`;
  const object = await env.INGEST_FRAMES.get(key);
  if (!object) return null;
  return new Uint8Array(await object.arrayBuffer());
}

/**
 * List composite keys in a time range by probing R2.
 * Since composites are written at 1 FPS, we check each second in the range.
 * For efficiency, we use R2 list with prefix filtering.
 */
export async function listCompositeKeys(
  env: Pick<Environment, 'INGEST_FRAMES'>,
  storeId: string,
  sessionStart: number,
  sessionEnd: number
): Promise<string[]> {
  const prefix = `composites/${storeId}/`;
  const keys: string[] = [];

  let cursor: string | undefined;
  do {
    const listed = await env.INGEST_FRAMES.list({
      prefix,
      cursor,
      limit: 1000,
    });

    for (const obj of listed.objects) {
      // Key format: composites/{store}/{bucket_sec}.jpg
      const filename = obj.key.replace(prefix, '');
      const bucketSec = Number.parseInt(filename.replace('.jpg', ''), 10);
      if (
        !Number.isNaN(bucketSec) &&
        bucketSec >= sessionStart &&
        bucketSec < sessionEnd
      ) {
        keys.push(obj.key);
      }
    }

    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  return keys.sort();
}

/**
 * Group bucket_sec values into time periods.
 * Period boundary: floor(bucket_sec / periodLength) * periodLength
 */
export function groupIntoPeriods(
  bucketSecs: number[],
  periodLength: number = 300
): Map<number, number[]> {
  const periods = new Map<number, number[]>();

  for (const sec of bucketSecs) {
    const periodStart = Math.floor(sec / periodLength) * periodLength;
    const existing = periods.get(periodStart);
    if (existing) {
      existing.push(sec);
    } else {
      periods.set(periodStart, [sec]);
    }
  }

  return periods;
}

/**
 * Pick a representative composite frame for a time period.
 * Strategy: pick the middle frame in the period for best representation.
 */
export function pickRepresentativeFrame(bucketSecs: number[]): number {
  const sorted = [...bucketSecs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

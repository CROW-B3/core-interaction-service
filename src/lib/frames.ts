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

/**
 * Minimum byte size for a composite JPEG to be considered "real footage".
 * Dead frames (all-black, all-white, uniform color) compress extremely well
 * as JPEG and typically land under 5KB. Real multi-tile composites with
 * actual footage are consistently 15KB+.
 */
const MIN_FRAME_BYTES = 8 * 1024; // 8KB

/**
 * Check if a frame is "dead" — all-black, all-white, or uniform with no
 * actual footage. Uses two heuristics:
 * 1. File size: dead frames compress to tiny JPEGs
 * 2. Byte entropy: uniform images have very low entropy in the JPEG payload
 */
export function isDeadFrame(bytes: Uint8Array): boolean {
  // Tiny JPEG = almost certainly a uniform/blank frame
  if (bytes.length < MIN_FRAME_BYTES) return true;

  // Sample entropy of the raw JPEG data (skip SOI header).
  // Real footage has high byte variation; uniform images don't.
  const sampleSize = Math.min(4096, bytes.length);
  const offset = Math.min(2, bytes.length); // skip JPEG SOI marker
  const freq = new Uint32Array(256);
  for (let i = offset; i < offset + sampleSize && i < bytes.length; i++) {
    freq[bytes[i]]++;
  }
  const n = Math.min(sampleSize, bytes.length - offset);
  let entropy = 0;
  for (let i = 0; i < 256; i++) {
    if (freq[i] === 0) continue;
    const p = freq[i] / n;
    entropy -= p * Math.log2(p);
  }

  // Real JPEG footage typically has entropy > 5.0 bits/byte.
  // Uniform/dead frames have very low entropy (< 3.0).
  return entropy < 3.5;
}

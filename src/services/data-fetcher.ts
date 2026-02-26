import type { SessionExportResponse } from '../types';

export async function fetchSessionExport(
  baseUrl: string,
  sessionId: string
): Promise<SessionExportResponse> {
  const url = `${baseUrl}/internal/sessions/${sessionId}/export`;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
  });

  if (response.status !== 200) {
    throw new Error(
      `Failed to fetch session export: ${response.status} ${response.statusText}`
    );
  }

  return response.json() as Promise<SessionExportResponse>;
}

export async function fetchReplayChunkData(
  baseUrl: string,
  sessionId: string,
  chunkIndex: number
): Promise<unknown[]> {
  const url = `${baseUrl}/internal/replay/${sessionId}/chunk/${chunkIndex}`;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
  });

  if (response.status !== 200) {
    throw new Error(
      `Failed to fetch replay chunk ${chunkIndex}: ${response.status} ${response.statusText}`
    );
  }

  const body = (await response.json()) as { success: boolean; data: unknown[] };
  return body.data;
}

export async function fetchAllReplayData(
  baseUrl: string,
  sessionId: string,
  chunks: Array<{ chunkIndex: number }>
): Promise<Map<number, unknown[]>> {
  const results = await Promise.allSettled(
    chunks.map(({ chunkIndex }) =>
      fetchReplayChunkData(baseUrl, sessionId, chunkIndex).then(data => ({
        chunkIndex,
        data,
      }))
    )
  );

  const replayData = new Map<number, unknown[]>();

  for (const result of results) {
    if (result.status === 'fulfilled') {
      replayData.set(result.value.chunkIndex, result.value.data);
    } else {
      console.warn(`Failed to fetch replay chunk: ${result.reason}`);
    }
  }

  return replayData;
}

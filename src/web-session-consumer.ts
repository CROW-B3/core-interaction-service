import type { Environment } from './types';
import type { SessionAnalysisPayload } from './web-session/agents/types';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './db/schema';
import { runSessionAnalysis } from './web-session/pipeline';

interface WebSession {
  id: string;
  initialUrl: string;
  referrer: string | null;
  userAgent: string;
  ipAddress: string;
  country: string | null;
  deviceType: string;
  browser: string;
  operatingSystem: string;
  startedAt: string;
  endedAt: string | null;
  durationInMilliseconds: number | null;
  hasReplay: boolean;
}

interface WebEvent {
  id: string;
  sessionId: string;
  type: string;
  url: string;
  timestamp: number;
  data: unknown;
}

interface RRwebSnapshotRow {
  id: string;
  sessionId: string;
  timestamp: number;
  eventType: string;
  data: string;
  compressed: number;
}

interface SessionDataResponse {
  success: boolean;
  session: WebSession & { projectId?: string | null };
  events: WebEvent[];
  rrwebSnapshots?: RRwebSnapshotRow[];
}

function buildInteractionData(session: WebSession, events: WebEvent[]): string {
  return JSON.stringify({
    sessionId: session.id,
    initialUrl: session.initialUrl,
    referrer: session.referrer,
    userAgent: session.userAgent,
    deviceType: session.deviceType,
    browser: session.browser,
    operatingSystem: session.operatingSystem,
    country: session.country,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    durationMs: session.durationInMilliseconds,
    eventCount: events.length,
    eventTypes: [...new Set(events.map(e => e.type))],
    events: events.map(e => ({
      type: e.type,
      url: e.url,
      timestamp: e.timestamp,
    })),
  });
}

function buildSummary(session: WebSession, events: WebEvent[]): string {
  const durationSec = session.durationInMilliseconds
    ? Math.round(session.durationInMilliseconds / 1000)
    : 0;
  const eventTypes = [...new Set(events.map(e => e.type))];
  return `Web session on ${session.initialUrl} | ${durationSec}s | ${events.length} events (${eventTypes.join(', ')}) | ${session.deviceType} / ${session.browser}`;
}

export async function processWebSessionExpiry(
  sessionId: string,
  env: Environment,
  organizationId?: string | null
): Promise<void> {
  const response = await fetch(
    `${env.WEB_INGEST_SERVICE_URL}/internal/sessions/${sessionId}/data`
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch session data: ${response.status} ${response.statusText}`
    );
  }

  const body = (await response.json()) as SessionDataResponse;
  const { session, events, rrwebSnapshots } = body;

  const data = buildInteractionData(session, events);
  const summary = buildSummary(session, events);

  const resolvedOrgId = organizationId ?? session.projectId ?? null;

  const db = drizzle(env.DB, { schema });
  await db.insert(schema.interaction).values({
    id: crypto.randomUUID(),
    organizationId: resolvedOrgId,
    sourceType: 'web',
    sessionId: session.id,
    data,
    summary,
    confidence: null,
    tags: null,
    productIds: null,
    timestamp: new Date(session.startedAt),
    createdAt: new Date(),
  });

  // Convert rrweb snapshots to events and merge into analysis payload
  const rrwebEvents = (rrwebSnapshots ?? []).map(snapshot => {
    // Timestamps from D1 may be in seconds; convert to ms if needed
    const timestampMs =
      snapshot.timestamp < 1e12
        ? snapshot.timestamp * 1000
        : snapshot.timestamp;

    let parsedData: Record<string, unknown> | null = null;
    try {
      parsedData = { rrwebEvent: JSON.parse(snapshot.data) };
    } catch {
      parsedData = null;
    }

    return {
      type: 'rrweb_snapshot' as const,
      timestamp: timestampMs,
      data: parsedData,
    };
  });

  const analysisPayload: SessionAnalysisPayload = {
    sessionId: session.id,
    projectId: resolvedOrgId ?? 'unknown',
    events: [
      ...events.map(e => ({
        type: e.type,
        timestamp: e.timestamp,
        url: e.url,
        data: e.data as Record<string, unknown> | null,
      })),
      ...rrwebEvents,
    ].sort((a, b) => a.timestamp - b.timestamp),
    metadata: {
      userAgent: session.userAgent,
      browser: session.browser,
      deviceType: session.deviceType,
      operatingSystem: session.operatingSystem,
      initialUrl: session.initialUrl,
      referrer: session.referrer,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
    },
  };

  try {
    await runSessionAnalysis(analysisPayload, env);
  } catch (err) {
    console.error('Analysis pipeline failed for queue path:', err);
  }
}

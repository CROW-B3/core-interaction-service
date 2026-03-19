import type {
  ExitContext,
  PageDomSummary,
  PageInteraction,
  PageVisit,
  PerformanceMetrics,
  PreprocessedSession,
  SessionAnalysisPayload,
  SessionEvent,
} from './agents/types';
import { chunkAndSummarizeDom } from './dom-chunker';

const ECOMMERCE_TYPES = new Set([
  'add_to_cart',
  'variant_select',
  'image_zoom',
]);

export async function preprocessSession(
  payload: SessionAnalysisPayload,
  ai: Ai
): Promise<PreprocessedSession> {
  const events = payload.events.sort((a, b) => a.timestamp - b.timestamp);
  const regularEvents = events.filter(e => e.type !== 'rrweb_snapshot');

  const pageDomSummaries = await chunkAndSummarizeDom(ai, events);
  const journey = buildJourney(regularEvents, pageDomSummaries);
  const exitContext = buildExitContext(regularEvents, pageDomSummaries);
  const performance = extractPerformanceMetrics(regularEvents);
  const eventCounts = countEventsByType(regularEvents);

  const startedAt = payload.metadata.startedAt
    ? new Date(payload.metadata.startedAt).getTime()
    : (events[0]?.timestamp ?? 0);
  const endedAt = payload.metadata.endedAt
    ? new Date(payload.metadata.endedAt).getTime()
    : (events[events.length - 1]?.timestamp ?? startedAt);

  return {
    sessionId: payload.sessionId,
    projectId: payload.projectId,
    userId: payload.userId,
    anonymousId: payload.anonymousId,
    metadata: payload.metadata,
    durationMs: endedAt - startedAt,
    journey,
    exitContext,
    performance,
    errors: regularEvents.filter(e => e.type === 'error'),
    rageClicks: regularEvents.filter(e => e.type === 'rage_click'),
    apiErrors: regularEvents.filter(e => e.type === 'api_error'),
    ecommerceEvents: regularEvents.filter(e => ECOMMERCE_TYPES.has(e.type)),
    eventCounts,
    totalEventCount: regularEvents.length,
    pageDomSummaries,
  };
}

function buildJourney(
  events: SessionEvent[],
  domSummaries: PageDomSummary[]
): PageVisit[] {
  const pageviews = events.filter(e => e.type === 'pageview' && e.url);
  if (pageviews.length === 0) return [];

  const domByUrl = new Map<string, PageDomSummary>();
  for (const summary of domSummaries) {
    domByUrl.set(summary.url, summary);
  }

  const visits: PageVisit[] = [];

  for (let i = 0; i < pageviews.length; i++) {
    const current = pageviews[i];
    const next = pageviews[i + 1];
    const entryTs = current.timestamp;
    const exitTs =
      next?.timestamp ?? events[events.length - 1]?.timestamp ?? entryTs;

    const pageEvents = events.filter(
      e =>
        e.timestamp >= entryTs &&
        e.timestamp < (next?.timestamp ?? Infinity) &&
        e.type !== 'pageview'
    );

    const interactions: PageInteraction[] = pageEvents.map(e => ({
      type: e.type,
      timestamp: e.timestamp,
      detail: summarizeEventDetail(e),
    }));

    visits.push({
      url: current.url!,
      entryTimestamp: entryTs,
      exitTimestamp: exitTs,
      timeOnPageMs: exitTs - entryTs,
      domSummary: domByUrl.get(current.url!),
      interactions,
    });
  }

  return visits;
}

function summarizeEventDetail(event: SessionEvent): string | undefined {
  if (!event.data) return undefined;
  const d = event.data;

  if (event.type === 'click' && d.text) return `Clicked: ${d.text}`;
  if (event.type === 'scroll' && d.scrollDepth)
    return `Scrolled to ${d.scrollDepth}%`;
  if (event.type === 'form' && d.fieldName) return `Form field: ${d.fieldName}`;
  if (event.type === 'add_to_cart' && d.productName)
    return `Added to cart: ${d.productName}`;
  if (event.type === 'web_vital' && d.name) return `${d.name}: ${d.value}`;
  if (event.type === 'api_error' && d.statusCode)
    return `API ${d.statusCode}: ${d.url ?? ''}`;
  if (event.type === 'error' && d.message) return `Error: ${d.message}`;

  return undefined;
}

function buildExitContext(
  events: SessionEvent[],
  domSummaries: PageDomSummary[]
): ExitContext {
  const lastEvents = events.slice(-5);
  const lastPageview = [...events]
    .reverse()
    .find(e => e.type === 'pageview' && e.url);
  const lastPage =
    lastPageview?.url ?? events[events.length - 1]?.url ?? 'unknown';

  const lastNonPageEvent = [...events]
    .reverse()
    .find(e => e.type !== 'pageview' && e.type !== 'visibility');
  const lastAction = lastNonPageEvent
    ? `${lastNonPageEvent.type}${lastNonPageEvent.data?.text ? `: ${lastNonPageEvent.data.text}` : ''}`
    : 'none';

  const addToCartEvents = events.filter(e => e.type === 'add_to_cart');
  const cartState =
    addToCartEvents.length > 0
      ? {
          itemCount: addToCartEvents.length,
          lastItem: addToCartEvents[addToCartEvents.length - 1]?.data,
        }
      : undefined;

  const lastDomSummary = domSummaries.find(s => s.url === lastPage);

  return { lastEvents, lastPage, lastAction, cartState, lastDomSummary };
}

function extractPerformanceMetrics(events: SessionEvent[]): PerformanceMetrics {
  const metrics: PerformanceMetrics = {};

  for (const event of events) {
    if (event.type !== 'web_vital' || !event.data) continue;
    const name = String(event.data.name ?? '').toUpperCase();
    const value = Number(event.data.value);
    if (Number.isNaN(value)) continue;

    if (name === 'LCP') metrics.lcp = value;
    else if (name === 'FID') metrics.fid = value;
    else if (name === 'CLS') metrics.cls = value;
    else if (name === 'TTFB') metrics.ttfb = value;
  }

  return metrics;
}

function countEventsByType(events: SessionEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) {
    counts[event.type] = (counts[event.type] ?? 0) + 1;
  }
  return counts;
}

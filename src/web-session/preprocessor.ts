import type {
  ExitContext,
  JourneyStep,
  NavigationPattern,
  PageDomSummary,
  PageInteraction,
  PageVisit,
  PerformanceMetrics,
  PreprocessedSession,
  SessionAnalysisPayload,
  SessionEvent,
  UserJourneyNarrative,
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
  const journeyNarrative = buildJourneyNarrative(journey, pageDomSummaries);

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
    journeyNarrative,
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
      elementContext: extractElementContext(e),
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

  if (event.type === 'click') {
    const target = d.text ?? d.ariaLabel ?? d.tagName ?? 'element';
    const href = d.href ? ` → ${d.href}` : '';
    return `Clicked "${target}"${href}`;
  }
  if (event.type === 'rage_click') {
    const target = d.text ?? d.ariaLabel ?? d.tagName ?? 'element';
    return `Rage-clicked "${target}" (${d.clickCount ?? 3}+ times)`;
  }
  if (event.type === 'scroll' && d.scrollDepth)
    return `Scrolled to ${d.scrollDepth}%`;
  if (event.type === 'form' && d.fieldName) return `Form field: ${d.fieldName}`;
  if (event.type === 'add_to_cart') {
    const name = d.productName ?? d.text ?? 'unknown item';
    const price = d.price ? ` ($${d.price})` : '';
    return `Added to cart: ${name}${price}`;
  }
  if (event.type === 'variant_select') {
    const name = d.variantName ?? d.text ?? 'unknown';
    const price = d.price ? ` ($${d.price})` : '';
    return `Selected variant: ${name}${price}`;
  }
  if (event.type === 'image_zoom') {
    return `Zoomed product image${d.imageIndex !== undefined ? ` #${d.imageIndex}` : ''}`;
  }
  if (event.type === 'navigation') {
    return `Navigated to ${d.toUrl ?? d.url ?? 'unknown'}`;
  }
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

function extractElementContext(
  event: SessionEvent
): PageInteraction['elementContext'] {
  if (!event.data) return undefined;
  const d = event.data;

  if (
    event.type !== 'click' &&
    event.type !== 'rage_click' &&
    event.type !== 'form'
  )
    return undefined;

  return {
    tag: d.tagName as string | undefined,
    text: truncate(d.text as string | undefined, 100),
    id: d.id as string | undefined,
    className: truncate(d.className as string | undefined, 80),
    ariaLabel: d.ariaLabel as string | undefined,
    href: d.href as string | undefined,
    domPath: truncate(
      Array.isArray(d.domPath)
        ? (d.domPath as { tag: string; text?: string }[])
            .map(p => p.tag + (p.text ? `(${p.text})` : ''))
            .join(' > ')
        : undefined,
      200
    ),
  };
}

function truncate(
  str: string | undefined | null,
  maxLen: number
): string | undefined {
  if (!str) return undefined;
  return str.length > maxLen ? `${str.slice(0, maxLen)}...` : str;
}

function buildJourneyNarrative(
  journey: PageVisit[],
  domSummaries: PageDomSummary[]
): UserJourneyNarrative {
  const domByUrl = new Map<string, PageDomSummary>();
  for (const summary of domSummaries) {
    domByUrl.set(summary.url, summary);
  }

  const steps: JourneyStep[] = journey.map((visit, i) => {
    const dom = visit.domSummary ?? domByUrl.get(visit.url);

    const keyActions = visit.interactions
      .filter(
        inter =>
          inter.type === 'click' ||
          inter.type === 'rage_click' ||
          inter.type === 'add_to_cart' ||
          inter.type === 'variant_select' ||
          inter.type === 'form' ||
          inter.type === 'scroll'
      )
      .map(inter => {
        if (inter.detail) return inter.detail;
        if (inter.elementContext?.text)
          return `${inter.type}: "${inter.elementContext.text}"`;
        return inter.type;
      })
      .slice(0, 10);

    const exitInteraction = visit.interactions[visit.interactions.length - 1];
    const exitAction = exitInteraction
      ? (exitInteraction.detail ?? exitInteraction.type)
      : undefined;

    return {
      stepNumber: i + 1,
      url: visit.url,
      pageTitle: dom?.title,
      pagePurpose: dom?.purpose,
      timeOnPageMs: visit.timeOnPageMs,
      keyActions,
      domContentSeen: dom?.visibleContent,
      productsViewed:
        dom?.productElements && dom.productElements.length > 0
          ? dom.productElements
          : undefined,
      exitAction,
    };
  });

  const urlCounts = new Map<string, number>();
  for (const visit of journey) {
    urlCounts.set(visit.url, (urlCounts.get(visit.url) ?? 0) + 1);
  }

  const revisitedPages = [...urlCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([url, visitCount]) => ({ url, visitCount }));

  const urls = journey.map(v => v.url);
  const pattern = detectNavigationPattern(urls);

  return {
    steps,
    pattern,
    revisitedPages,
    totalPagesVisited: journey.length,
    uniquePagesVisited: urlCounts.size,
  };
}

function detectNavigationPattern(urls: string[]): NavigationPattern {
  if (urls.length <= 1) {
    return {
      type: 'bounce',
      description: 'User visited only one page before leaving',
      urls,
    };
  }

  const hasBackAndForth =
    urls.length >= 3 &&
    urls.some((url, i) => i >= 2 && url === urls[i - 2] && url !== urls[i - 1]);

  if (hasBackAndForth) {
    return {
      type: 'back_and_forth',
      description:
        'User navigated back and forth between pages, suggesting comparison or hesitation',
      urls,
    };
  }

  const uniqueUrls = new Set(urls);
  const hasLoop = urls.length > uniqueUrls.size && urls.length >= 4;

  if (hasLoop) {
    return {
      type: 'loop',
      description:
        'User revisited pages, suggesting they were looking for something or comparing options',
      urls,
    };
  }

  return {
    type: 'linear',
    description: 'User followed a linear path through the site',
    urls,
  };
}

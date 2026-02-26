import type { NormalizedTimeline, PageWindow, SessionEvent } from '../types';

const IDLE_GAP_THRESHOLD_MS = 5000;
const MAX_ENGAGEMENT_SCORE = 10;

const EVENT_WEIGHTS: Record<string, number> = {
  click: 3,
  form_submit: 5,
  form_change: 5,
  form_focus: 5,
  scroll: 1,
  pageview: 0.5,
};

function getScrollDepth(events: SessionEvent[]): number {
  let maxDepth = 0;

  for (const event of events) {
    if (event.type !== 'scroll' || !event.data) continue;

    const percentage =
      typeof event.data.scrollPercentage === 'number'
        ? event.data.scrollPercentage
        : typeof event.data.scrollDepth === 'number'
          ? event.data.scrollDepth
          : 0;

    if (percentage > maxDepth) {
      maxDepth = percentage;
    }
  }

  return maxDepth;
}

function calculateEngagementScore(
  events: SessionEvent[],
  timeSpentMs: number
): number {
  let rawScore = 0;

  for (const event of events) {
    const weight = EVENT_WEIGHTS[event.type] ?? 0;
    rawScore += weight;
  }

  const timeSeconds = Math.max(timeSpentMs / 1000, 1);
  const score = rawScore / timeSeconds;

  return Math.min(score, MAX_ENGAGEMENT_SCORE);
}

function findIdleGaps(
  events: SessionEvent[]
): Array<{ start: number; end: number; durationMs: number }> {
  const gaps: Array<{ start: number; end: number; durationMs: number }> = [];

  for (let i = 1; i < events.length; i++) {
    const gap = events[i].timestamp - events[i - 1].timestamp;
    if (gap > IDLE_GAP_THRESHOLD_MS) {
      gaps.push({
        start: events[i - 1].timestamp,
        end: events[i].timestamp,
        durationMs: gap,
      });
    }
  }

  return gaps;
}

function countEventsByType(events: SessionEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const event of events) {
    counts[event.type] = (counts[event.type] ?? 0) + 1;
  }

  return counts;
}

function buildPageWindow(url: string, events: SessionEvent[]): PageWindow {
  const enterTimestamp = events[0].timestamp;
  const exitTimestamp = events[events.length - 1].timestamp;
  const timeSpentMs = exitTimestamp - enterTimestamp;

  return {
    url,
    enterTimestamp,
    exitTimestamp,
    timeSpentMs,
    events,
    eventCounts: countEventsByType(events),
    scrollDepth: getScrollDepth(events),
    engagementScore: calculateEngagementScore(events, timeSpentMs),
    idleGaps: findIdleGaps(events),
  };
}

export function normalizeEvents(events: SessionEvent[]): NormalizedTimeline {
  if (events.length === 0) {
    return {
      pages: [],
      navigationSequence: [],
      totalDurationMs: 0,
      totalEvents: 0,
    };
  }

  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

  // Group consecutive events by URL into page windows
  const pages: PageWindow[] = [];
  const navigationSequence: string[] = [];

  let currentUrl = sorted[0].url;
  let currentEvents: SessionEvent[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const event = sorted[i];

    if (event.url !== currentUrl) {
      // URL changed: finalize the current page window
      pages.push(buildPageWindow(currentUrl, currentEvents));

      if (!navigationSequence.includes(currentUrl)) {
        navigationSequence.push(currentUrl);
      }

      currentUrl = event.url;
      currentEvents = [event];
    } else {
      currentEvents.push(event);
    }
  }

  // Finalize the last page window
  pages.push(buildPageWindow(currentUrl, currentEvents));
  if (!navigationSequence.includes(currentUrl)) {
    navigationSequence.push(currentUrl);
  }

  const totalDurationMs =
    sorted[sorted.length - 1].timestamp - sorted[0].timestamp;

  return {
    pages,
    navigationSequence,
    totalDurationMs,
    totalEvents: sorted.length,
  };
}

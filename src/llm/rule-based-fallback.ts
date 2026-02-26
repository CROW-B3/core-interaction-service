import type {
  AnalysisResult,
  ExitAnalysis,
  JourneyAnalysis,
  NormalizedTimeline,
  PageAnalysis,
  SessionData,
} from '../types';

function inferIntent(pages: NormalizedTimeline['pages']): string {
  const allEventTypes = new Set<string>();
  for (const page of pages) {
    for (const eventType of Object.keys(page.eventCounts)) {
      if (page.eventCounts[eventType] > 0) {
        allEventTypes.add(eventType);
      }
    }
  }

  const hasFormEvents =
    allEventTypes.has('form_submit') ||
    allEventTypes.has('form_input') ||
    allEventTypes.has('form_change');
  const hasAddToCart = allEventTypes.has('add_to_cart');
  const mostlyPageviews =
    allEventTypes.size <= 2 && allEventTypes.has('pageview');

  if (hasFormEvents) return 'form_completion';
  if (hasAddToCart) return 'shopping';
  if (mostlyPageviews) return 'browsing';
  return 'exploration';
}

function inferJourneyType(pageCount: number, durationMs: number): string {
  if (pageCount === 1) return 'single_page';
  if (durationMs < 10000) return 'bounce';
  if (pageCount > 5) return 'deep_exploration';
  return 'standard_browse';
}

function collectKeyActions(pages: NormalizedTimeline['pages']): string[] {
  const actionSet = new Set<string>();
  for (const page of pages) {
    for (const [eventType, count] of Object.entries(page.eventCounts)) {
      if (count > 0) {
        actionSet.add(eventType);
      }
    }
  }
  return Array.from(actionSet);
}

function detectFrictionPoints(pages: NormalizedTimeline['pages']): string[] {
  const frictionPoints: string[] = [];

  for (const page of pages) {
    if (page.eventCounts.error > 0) {
      frictionPoints.push(`Error events on ${page.url}`);
    }
    if (page.eventCounts.rage_click > 0) {
      frictionPoints.push(`Rage clicks on ${page.url}`);
    }
    const longIdleGaps = page.idleGaps.filter(gap => gap.durationMs > 30000);
    if (longIdleGaps.length > 0) {
      frictionPoints.push(`Idle gap over 30s on ${page.url}`);
    }
  }

  return frictionPoints;
}

function detectSatisfactionIndicators(
  pages: NormalizedTimeline['pages']
): string[] {
  const indicators: string[] = [];

  for (const page of pages) {
    if (page.scrollDepth > 70) {
      indicators.push(
        `High scroll depth (${page.scrollDepth}%) on ${page.url}`
      );
    }
    if (page.eventCounts.form_submit > 0) {
      indicators.push(`Form submission on ${page.url}`);
    }
    if (page.timeSpentMs > 60000) {
      indicators.push(
        `Long engagement (${Math.round(page.timeSpentMs / 1000)}s) on ${page.url}`
      );
    }
  }

  return indicators;
}

function inferPagePurpose(url: string): string {
  const path = extractPath(url);

  if (path.includes('/cart')) return 'shopping_cart';
  if (path.includes('/checkout')) return 'checkout';
  if (path.includes('/login') || path.includes('/signup'))
    return 'authentication';
  if (path.includes('/search')) return 'search';
  return 'content_page';
}

function extractPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function buildPageInteractions(eventCounts: Record<string, number>): string[] {
  const interactions: string[] = [];
  for (const [type, count] of Object.entries(eventCounts)) {
    if (count > 0) {
      interactions.push(`${count} ${type} events`);
    }
  }
  return interactions;
}

function determineEngagementLevel(engagementScore: number): string {
  if (engagementScore < 2) return 'low';
  if (engagementScore < 5) return 'medium';
  return 'high';
}

function detectPageIssues(page: NormalizedTimeline['pages'][number]): string[] {
  const issues: string[] = [];

  if (page.eventCounts.rage_click > 0) {
    issues.push('Rage clicks detected');
  }
  if (page.eventCounts.error > 0) {
    issues.push('Errors encountered');
  }
  if (page.idleGaps.length > 2) {
    issues.push('Multiple idle periods');
  }

  return issues;
}

function generateSuggestions(
  pageAnalyses: PageAnalysis[],
  exitAnalysis: Pick<ExitAnalysis, 'exitType'>
): string[] {
  const suggestions: string[] = [];

  const hasRageClicks = pageAnalyses.some(p =>
    p.issues.includes('Rage clicks detected')
  );
  const hasErrors = pageAnalyses.some(p =>
    p.issues.includes('Errors encountered')
  );
  const hasIdlePeriods = pageAnalyses.some(p =>
    p.issues.includes('Multiple idle periods')
  );

  if (hasRageClicks) {
    suggestions.push('Investigate UI elements causing rage clicks');
  }
  if (hasErrors) {
    suggestions.push('Review and resolve page errors');
  }
  if (hasIdlePeriods) {
    suggestions.push('Analyze content causing user idle periods');
  }
  if (exitAnalysis.exitType === 'bounce') {
    suggestions.push('Improve landing page engagement to reduce bounce rate');
  }
  if (exitAnalysis.exitType === 'error') {
    suggestions.push('Fix errors on exit page to prevent error-driven exits');
  }

  return suggestions;
}

export function generateRuleBasedAnalysis(
  session: SessionData,
  timeline: NormalizedTimeline
): AnalysisResult {
  const { pages, totalDurationMs } = timeline;
  const pageCount = pages.length;
  const durationSeconds = Math.round(totalDurationMs / 1000);
  const initialUrl = session.initialUrl ?? 'unknown';

  // Journey Analysis
  const intent = inferIntent(pages);
  const journeyType = inferJourneyType(pageCount, totalDurationMs);
  const keyActions = collectKeyActions(pages);
  const frictionPoints = detectFrictionPoints(pages);
  const satisfactionIndicators = detectSatisfactionIndicators(pages);
  const journeySummary = `User visited ${pageCount} pages over ${durationSeconds} seconds starting from ${initialUrl}`;

  const journeyAnalysis: JourneyAnalysis = {
    summary: journeySummary,
    intent,
    journeyType,
    keyActions,
    frictionPoints,
    satisfactionIndicators,
    confidence: 0,
  };

  // Page Analyses
  const pageAnalyses: PageAnalysis[] = pages.map(page => ({
    url: page.url,
    timeSpentMs: page.timeSpentMs,
    purpose: inferPagePurpose(page.url),
    interactions: buildPageInteractions(page.eventCounts),
    engagementLevel: determineEngagementLevel(page.engagementScore),
    issues: detectPageIssues(page),
  }));

  // Exit Analysis
  const lastPage = pages.length > 0 ? pages[pages.length - 1] : null;
  const exitPage = lastPage?.url ?? session.exitContext?.exitPage ?? 'unknown';

  const exitReason = session.exitContext?.exitTrigger ?? 'unknown';

  let exitType: string;
  if (pageCount === 1 && totalDurationMs < 10000) {
    exitType = 'bounce';
  } else if (lastPage && lastPage.eventCounts.error > 0) {
    exitType = 'error';
  } else if (session.exitContext) {
    exitType = 'natural';
  } else {
    exitType = 'abandonment';
  }

  const lastActions: string[] = lastPage
    ? lastPage.events.slice(-5).map(event => event.type)
    : [];

  const suggestions = generateSuggestions(pageAnalyses, { exitType });

  const exitAnalysis: ExitAnalysis = {
    exitPage,
    exitReason,
    exitType,
    lastActions,
    suggestions,
    confidence: 0,
  };

  return {
    journeyAnalysis,
    pageAnalyses,
    exitAnalysis,
    summary: journeySummary,
    confidence: 0,
    tags: [journeyType, exitType, intent],
  };
}

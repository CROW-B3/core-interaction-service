import type { DeterministicIssue, PreprocessedSession } from './agents/types';

export function detectDeterministicIssues(
  session: PreprocessedSession
): DeterministicIssue[] {
  const issues: DeterministicIssue[] = [];

  detectSlowPageLoads(session, issues);
  detectRageClicks(session, issues);
  detectApiErrors(session, issues);
  detectJsErrors(session, issues);
  detectOutOfStock(session, issues);

  return issues;
}

function detectSlowPageLoads(
  session: PreprocessedSession,
  issues: DeterministicIssue[]
): void {
  const { lcp, ttfb, cls } = session.performance;

  if (lcp !== undefined && lcp > 2500) {
    issues.push({
      type: 'slow_lcp',
      severity: lcp > 4000 ? 'critical' : 'high',
      description: `Largest Contentful Paint is ${Math.round(lcp)}ms (threshold: 2500ms)`,
      metric: lcp,
    });
  }

  if (ttfb !== undefined && ttfb > 800) {
    issues.push({
      type: 'slow_ttfb',
      severity: ttfb > 1800 ? 'critical' : 'high',
      description: `Time to First Byte is ${Math.round(ttfb)}ms (threshold: 800ms)`,
      metric: ttfb,
    });
  }

  if (cls !== undefined && cls > 0.1) {
    issues.push({
      type: 'high_cls',
      severity: cls > 0.25 ? 'critical' : 'medium',
      description: `Cumulative Layout Shift is ${cls.toFixed(3)} (threshold: 0.1)`,
      metric: cls,
    });
  }
}

function detectRageClicks(
  session: PreprocessedSession,
  issues: DeterministicIssue[]
): void {
  for (const event of session.rageClicks) {
    issues.push({
      type: 'rage_click',
      severity: 'high',
      description: `Rage click detected${event.data?.text ? ` on "${event.data.text}"` : ''}`,
      url: event.url,
      timestamp: event.timestamp,
    });
  }
}

function detectApiErrors(
  session: PreprocessedSession,
  issues: DeterministicIssue[]
): void {
  for (const event of session.apiErrors) {
    const statusCode = Number(event.data?.statusCode ?? 0);
    const apiUrl = String(event.data?.url ?? event.url ?? '');

    if (statusCode >= 500) {
      issues.push({
        type: 'api_error_5xx',
        severity: 'critical',
        description: `Server error ${statusCode} on ${apiUrl}`,
        url: event.url,
        timestamp: event.timestamp,
        metric: statusCode,
      });
    } else if (statusCode >= 400) {
      issues.push({
        type: statusCode === 404 ? 'page_not_found' : 'api_error_4xx',
        severity: statusCode === 404 ? 'high' : 'medium',
        description: `Client error ${statusCode} on ${apiUrl}`,
        url: event.url,
        timestamp: event.timestamp,
        metric: statusCode,
      });
    }
  }
}

function detectJsErrors(
  session: PreprocessedSession,
  issues: DeterministicIssue[]
): void {
  for (const event of session.errors) {
    issues.push({
      type: 'js_error',
      severity: 'high',
      description: `JavaScript error: ${String(event.data?.message ?? 'Unknown error').slice(0, 200)}`,
      url: event.url,
      timestamp: event.timestamp,
    });
  }
}

function detectOutOfStock(
  session: PreprocessedSession,
  issues: DeterministicIssue[]
): void {
  for (const summary of session.pageDomSummaries) {
    for (const product of summary.productElements) {
      const stock = (product.stock ?? '').toLowerCase();
      if (
        stock.includes('out of stock') ||
        stock.includes('sold out') ||
        stock.includes('unavailable')
      ) {
        issues.push({
          type: 'out_of_stock',
          severity: 'high',
          description: `Product "${product.name ?? 'unknown'}" appears out of stock on ${summary.url}`,
          url: summary.url,
        });
      }
    }
  }
}

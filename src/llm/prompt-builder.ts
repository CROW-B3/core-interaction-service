import type {
  ExitContext,
  NormalizedTimeline,
  PageWindow,
  SessionData,
} from '../types';

/**
 * Builds the system prompt instructing the AI how to analyze user session data.
 * Specifies the exact JSON output schema the model must follow.
 */
export function buildSystemPrompt(): string {
  return `You are a user-session analyst. You will receive structured session data from a website and must analyze it to produce actionable insights.

Return your analysis as valid JSON with exactly three top-level keys: journey_analysis, page_analyses, exit_analysis. Do not include any text outside the JSON object.

## Expected JSON Schema

\`\`\`json
{
  "journey_analysis": {
    "summary": "string — brief overall description of the user journey",
    "intent": "string — inferred user intent or goal",
    "journey_type": "string — e.g. browsing, purchasing, researching, onboarding, support",
    "key_actions": ["string — notable actions the user took"],
    "friction_points": ["string — points where the user struggled or hesitated"],
    "satisfaction_indicators": ["string — signals of positive experience"],
    "confidence": 0.0
  },
  "page_analyses": [
    {
      "url": "string — page URL",
      "purpose": "string — inferred purpose of this page visit",
      "interactions": ["string — notable interactions on this page"],
      "time_spent_ms": 0,
      "engagement_level": "low | medium | high",
      "issues": ["string — problems detected on this page"]
    }
  ],
  "exit_analysis": {
    "exit_page": "string — URL where the user left",
    "exit_reason": "string — inferred reason for leaving",
    "exit_type": "natural | bounce | error | abandonment",
    "last_actions": ["string — last actions before exit"],
    "suggestions": ["string — suggestions to improve retention"],
    "confidence": 0.0
  }
}
\`\`\`

## Guidelines

- Be concise and factual.
- Base your analysis only on the provided data. Do not speculate beyond what the data supports.
- Set confidence scores between 0 and 1 reflecting how well the data supports your conclusions.
- If data is insufficient for a field, use a short explanatory string rather than leaving it empty.
- For page_analyses, include an entry for every page visited.
- For engagement_level, use "low" (< 5s or minimal interaction), "medium" (moderate time and interaction), or "high" (extended time with significant interaction).`;
}

/**
 * Formats a duration in milliseconds to a human-readable string.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

/**
 * Truncates a string to a maximum length, appending "... [truncated]" if needed.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}... [truncated]`;
}

/**
 * Summarizes event data into a short string of at most maxLength characters.
 */
function summarizeEventData(
  data: Record<string, unknown> | null,
  maxLength: number
): string {
  if (!data) {
    return '';
  }
  const raw = JSON.stringify(data);
  return truncate(raw, maxLength);
}

/**
 * Determines which page URLs should receive DOM snapshots.
 * Prioritizes first page, last page, pages with most interactions, and pages with errors.
 * If more than 10 pages, only the top 5 most important get snapshots.
 */
function selectPagesForDom(
  pages: PageWindow[],
  domSnapshots: Map<string, string>
): Set<string> {
  if (pages.length === 0) {
    return new Set();
  }

  // Only consider pages that have a DOM snapshot available
  const pagesWithDom = pages.filter(p => domSnapshots.has(p.url));
  if (pagesWithDom.length === 0) {
    return new Set();
  }

  const maxDomPages = pages.length > 10 ? 5 : pagesWithDom.length;
  const selected = new Set<string>();

  // Always prioritize first and last page
  const firstUrl = pages[0].url;
  const lastUrl = pages[pages.length - 1].url;
  if (domSnapshots.has(firstUrl)) {
    selected.add(firstUrl);
  }
  if (domSnapshots.has(lastUrl)) {
    selected.add(lastUrl);
  }

  // Score remaining pages: interactions count + error presence
  const scored = pagesWithDom
    .filter(p => !selected.has(p.url))
    .map(p => {
      const totalEvents = Object.values(p.eventCounts).reduce(
        (sum, c) => sum + c,
        0
      );
      const hasErrors = (p.eventCounts.error || 0) > 0;
      return {
        url: p.url,
        score: totalEvents + (hasErrors ? 1000 : 0),
      };
    })
    .sort((a, b) => b.score - a.score);

  for (const entry of scored) {
    if (selected.size >= maxDomPages) break;
    selected.add(entry.url);
  }

  return selected;
}

/**
 * Builds the user prompt containing all session data for analysis.
 */
export function buildUserPrompt(
  session: SessionData,
  timeline: NormalizedTimeline,
  domSnapshots: Map<string, string>,
  exitContext: ExitContext | null,
  domTruncateLimit: number = 2000
): string {
  const sections: string[] = [];

  // --- SESSION DATA ---
  const duration = session.durationInMilliseconds
    ? formatDuration(session.durationInMilliseconds)
    : 'unknown';

  sections.push(`## SESSION DATA

- **Device type**: ${session.deviceType ?? 'unknown'}
- **Browser**: ${session.browser ?? 'unknown'}
- **OS**: ${session.operatingSystem ?? 'unknown'}
- **Duration**: ${duration}
- **Page count**: ${timeline.pages.length}
- **Total events**: ${timeline.totalEvents}`);

  // --- NAVIGATION TIMELINE ---
  const pagesForDom = selectPagesForDom(timeline.pages, domSnapshots);

  const pageLines: string[] = [];
  for (let i = 0; i < timeline.pages.length; i++) {
    const page = timeline.pages[i];
    const eventSummary = Object.entries(page.eventCounts)
      .map(([type, count]) => `${type}: ${count}`)
      .join(', ');

    let pageBlock = `### Page ${i + 1}: ${page.url}
- **Time spent**: ${formatDuration(page.timeSpentMs)}
- **Events**: ${eventSummary || 'none'}`;

    if (pagesForDom.has(page.url)) {
      const snapshot = domSnapshots.get(page.url);
      if (snapshot) {
        const trimmed = truncate(snapshot, domTruncateLimit);
        pageBlock += `\n- **DOM snapshot**:\n\`\`\`\n${trimmed}\n\`\`\``;
      }
    }

    pageLines.push(pageBlock);
  }

  sections.push(`## NAVIGATION TIMELINE\n\n${pageLines.join('\n\n')}`);

  // --- EVENT LOG ---
  const sessionStart = session.startedAt;
  const eventsToLog: Array<{
    timestamp: number;
    type: string;
    url: string;
    data: Record<string, unknown> | null;
  }> = [];

  for (const page of timeline.pages) {
    for (const event of page.events) {
      eventsToLog.push({
        timestamp: event.timestamp,
        type: event.type,
        url: event.url,
        data: event.data,
      });
    }
  }

  // Sort by timestamp and take first 80
  eventsToLog.sort((a, b) => a.timestamp - b.timestamp);
  const limitedEvents = eventsToLog.slice(0, 80);

  const eventLines = limitedEvents.map(e => {
    const relativeSeconds = ((e.timestamp - sessionStart) / 1000).toFixed(1);
    const dataSummary = summarizeEventData(e.data, 100);
    return `[${relativeSeconds}s] [${e.type}] [${e.url}] ${dataSummary}`;
  });

  let eventLogSection = `## EVENT LOG (first ${limitedEvents.length} of ${eventsToLog.length} events)\n\n`;
  eventLogSection += eventLines.join('\n');

  sections.push(eventLogSection);

  // --- EXIT CONTEXT ---
  if (exitContext) {
    let exitSection = `## EXIT CONTEXT\n`;
    if (exitContext.exitPage) {
      exitSection += `\n- **Exit page**: ${exitContext.exitPage}`;
    }
    if (exitContext.exitTrigger) {
      exitSection += `\n- **Exit trigger**: ${exitContext.exitTrigger}`;
    }
    if (
      exitContext.lastInteractions &&
      exitContext.lastInteractions.length > 0
    ) {
      exitSection += `\n- **Last interactions**:`;
      for (const interaction of exitContext.lastInteractions) {
        const ts = interaction.timestamp
          ? ` at ${((interaction.timestamp - sessionStart) / 1000).toFixed(1)}s`
          : '';
        const target = interaction.target ? ` on ${interaction.target}` : '';
        exitSection += `\n  - ${interaction.type}${target}${ts}`;
      }
    }
    sections.push(exitSection);
  }

  return sections.join('\n\n---\n\n');
}

/**
 * Rough token estimate: approximately 1 token per 4 characters.
 * Used for budget checking before sending to the model.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Builds the complete prompt pair (system + user) for session analysis.
 * If the estimated user prompt tokens exceed 100,000, DOM snapshots are
 * further truncated to 1000 characters per page.
 */
export function buildPrompt(
  session: SessionData,
  timeline: NormalizedTimeline,
  domSnapshots: Map<string, string>
): { system: string; user: string } {
  const system = buildSystemPrompt();
  const exitContext = session.exitContext ?? null;

  // First pass with the default 2000-char DOM limit
  let user = buildUserPrompt(
    session,
    timeline,
    domSnapshots,
    exitContext,
    2000
  );

  // If estimated tokens exceed the budget, rebuild with a tighter DOM limit
  if (estimateTokens(user) > 100000) {
    user = buildUserPrompt(session, timeline, domSnapshots, exitContext, 1000);
  }

  return { system, user };
}

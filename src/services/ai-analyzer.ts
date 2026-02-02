import type { SessionEvent } from '../db/schema';
import type { Interaction } from '../db/schema';

export interface AIAnalysisResult {
  interactions: Interaction[];
  summary: string;
}

/**
 * Analyze session events using Cloudflare Workers AI
 * This implementation uses multi-agentic approach with Claude
 */
export async function analyzeSessionWithAI(
  env: any,
  sessionId: string,
  events: SessionEvent[],
  eventCount: number
): Promise<Interaction[]> {
  if (events.length === 0) {
    return [];
  }

  try {
    // Check if AI binding is available
    if (!env?.AI) {
      console.warn('AI binding not available, using rule-based analysis');
      return performRuleBasedAnalysis(sessionId, events, eventCount);
    }

    // Prepare event summary for AI analysis
    const eventSummary = prepareEventSummary(events);
    const prompt = buildAnalysisPrompt(sessionId, eventCount, eventSummary, events);

    // Call Cloudflare Workers AI (using Claude model)
    const response = await env.AI.run('@cf/meta/llama-2-7b-chat-int8', {
      messages: [
        {
          role: 'system',
          content: `You are an expert user behavior analyst. Analyze the provided web session events and identify user interactions, engagement patterns, and anomalies. Return a JSON array of interactions with the following structure for each:
          {
            "type": "user_behavior|engagement_pattern|anomaly|custom",
            "title": "brief title",
            "description": "detailed description",
            "confidence": 0.0-1.0,
            "tags": ["tag1", "tag2"]
          }`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Parse AI response
    const interactions = parseAIResponse(response, sessionId, eventCount);
    return interactions;
  } catch (error) {
    console.error('AI analysis failed:', error);
    // Fallback to rule-based analysis if AI fails
    return performRuleBasedAnalysis(sessionId, events, eventCount);
  }
}

/**
 * Prepare event summary for AI analysis
 */
function prepareEventSummary(events: SessionEvent[]): string {
  const eventCounts: Record<string, number> = {};
  const urls = new Set<string>();
  const eventTypes = new Set<string>();

  for (const event of events) {
    eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;
    urls.add(event.url);
    eventTypes.add(event.type);
  }

  const clickCount = eventCounts['click'] || 0;
  const errorCount = eventCounts['error'] || 0;
  const formCount = eventCounts['form'] || 0;
  const pageviewCount = eventCounts['pageview'] || 0;

  return `
Session Event Summary:
- Total Events: ${events.length}
- Pageviews: ${pageviewCount}
- Clicks: ${clickCount}
- Form Interactions: ${formCount}
- Errors: ${errorCount}
- Unique URLs: ${urls.size}
- Event Types: ${Array.from(eventTypes).join(', ')}
- Session Duration: ${calculateDuration(events)} ms
`;
}

/**
 * Build analysis prompt for AI
 */
function buildAnalysisPrompt(
  sessionId: string,
  eventCount: number,
  eventSummary: string,
  events: SessionEvent[]
): string {
  const topEvents = events.slice(0, 20);
  const eventsStr = topEvents
    .map(
      e =>
        `[${new Date(e.timestamp).toISOString()}] ${e.type.toUpperCase()}: ${e.url} ${
          e.data ? `(${JSON.stringify(e.data)})` : ''
        }`
    )
    .join('\n');

  return `
Please analyze the following web session:

${eventSummary}

Top Events (first 20):
${eventsStr}

Identify and categorize:
1. User behavior patterns (what the user was trying to do)
2. Engagement indicators (high engagement, low engagement, abandoned, etc.)
3. Any anomalies or error patterns
4. Form completion status if applicable

Return ONLY a valid JSON array of interactions. Example format:
[
  {
    "type": "engagement_pattern",
    "title": "High Click Activity",
    "description": "User performed 25 clicks across 5 pages",
    "confidence": 0.85,
    "tags": ["high_engagement", "exploratory"]
  }
]
`;
}

/**
 * Parse AI response and create interactions
 */
function parseAIResponse(response: any, sessionId: string, eventCount: number): Interaction[] {
  try {
    let content = response?.result?.response || response?.toString() || '';

    // Extract JSON array from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('No JSON found in AI response, using fallback');
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((item: any) => ({
      id: `interaction_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      sessionId,
      eventCount,
      type: item.type || 'custom',
      title: item.title || 'Unnamed Interaction',
      description: item.description || '',
      confidence: Math.min(1, Math.max(0, item.confidence || 0.5)),
      tags: Array.isArray(item.tags) ? item.tags : [],
      createdAt: Date.now(),
      processedAt: Date.now(),
    }));
  } catch (error) {
    console.error('Failed to parse AI response:', error);
    return [];
  }
}

/**
 * Fallback rule-based analysis when AI is unavailable
 */
function performRuleBasedAnalysis(
  sessionId: string,
  events: SessionEvent[],
  eventCount: number
): Interaction[] {
  const interactions: Interaction[] = [];
  const now = Date.now();

  // Count event types
  const eventCounts: Record<string, number> = {};
  let hasErrors = false;
  let formFilledOut = false;

  for (const event of events) {
    eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;
    if (event.type === 'error') hasErrors = true;
    if (event.type === 'form' && event.data?.success) formFilledOut = true;
  }

  const clickCount = eventCounts['click'] || 0;
  const errorCount = eventCounts['error'] || 0;

  // Rule 1: Engagement level
  if (clickCount > 10) {
    interactions.push({
      id: `interaction_${now}_1`,
      sessionId,
      eventCount,
      type: 'engagement_pattern',
      title: 'High User Engagement',
      description: `User performed ${clickCount} clicks showing strong engagement with the site`,
      confidence: Math.min(1, clickCount / 50),
      tags: ['high_engagement', 'active_user'],
      createdAt: now,
      processedAt: now,
    });
  } else if (clickCount > 0) {
    interactions.push({
      id: `interaction_${now}_2`,
      sessionId,
      eventCount,
      type: 'engagement_pattern',
      title: 'Low User Engagement',
      description: `User performed only ${clickCount} clicks, indicating browsing behavior`,
      confidence: 0.6,
      tags: ['low_engagement', 'browser'],
      createdAt: now,
      processedAt: now,
    });
  }

  // Rule 2: Error detection
  if (errorCount > 0) {
    interactions.push({
      id: `interaction_${now}_3`,
      sessionId,
      eventCount,
      type: 'anomaly',
      title: 'JavaScript Errors Detected',
      description: `User experienced ${errorCount} error(s) during session`,
      confidence: 0.9,
      tags: ['errors', 'technical_issue'],
      createdAt: now,
      processedAt: now,
    });
  }

  // Rule 3: Form completion
  if (formFilledOut) {
    interactions.push({
      id: `interaction_${now}_4`,
      sessionId,
      eventCount,
      type: 'user_behavior',
      title: 'Form Completion',
      description: 'User successfully completed and submitted a form',
      confidence: 0.95,
      tags: ['form_submission', 'conversion'],
      createdAt: now,
      processedAt: now,
    });
  }

  // Rule 4: Session duration
  const duration = calculateDuration(events);
  if (duration < 30000) {
    // less than 30 seconds
    interactions.push({
      id: `interaction_${now}_5`,
      sessionId,
      eventCount,
      type: 'user_behavior',
      title: 'Quick Exit',
      description: 'User left the site quickly without significant interaction',
      confidence: 0.7,
      tags: ['quick_exit', 'bounce'],
      createdAt: now,
      processedAt: now,
    });
  }

  return interactions;
}

/**
 * Calculate total session duration in milliseconds
 */
function calculateDuration(events: SessionEvent[]): number {
  if (events.length === 0) return 0;
  const timestamps = events.map(e => e.timestamp).sort((a, b) => a - b);
  return timestamps[timestamps.length - 1] - timestamps[0];
}

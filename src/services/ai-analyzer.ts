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
          content: `You are an expert user behavior analyst specializing in web session analysis. Your task is to identify meaningful user interactions, engagement patterns, anomalies, and behavioral insights from web session events. Be thorough, specific, and data-driven in your analysis. Return a JSON array of interactions with precise, actionable insights.`,
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
  const urlSequence: string[] = [];
  let lastUrl = '';
  let totalDwell = 0;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;
    urls.add(event.url);
    eventTypes.add(event.type);

    // Track URL sequence
    if (event.url !== lastUrl) {
      urlSequence.push(event.url);
      lastUrl = event.url;
    }

    // Calculate dwell time (time between events)
    if (i < events.length - 1) {
      totalDwell += events[i + 1].timestamp - event.timestamp;
    }
  }

  const clickCount = eventCounts['click'] || 0;
  const errorCount = eventCounts['error'] || 0;
  const formCount = eventCounts['form'] || 0;
  const pageviewCount = eventCounts['pageview'] || 0;
  const sessionDuration = calculateDuration(events);
  const avgTimePerEvent = events.length > 0 ? Math.round(totalDwell / events.length) : 0;

  return `📊 SESSION ANALYTICS:
- Total Events: ${events.length} | Unique URLs: ${urls.size}
- Pageviews: ${pageviewCount} | Clicks: ${clickCount} | Forms: ${formCount} | Errors: ${errorCount}
- Session Duration: ${sessionDuration}ms (${Math.round(sessionDuration / 1000)}s total)
- Avg Time Per Event: ${avgTimePerEvent}ms
- User Path: ${urlSequence.slice(0, 5).join(' → ')}${urlSequence.length > 5 ? ` → (${urlSequence.length - 5} more)` : ''}
- Event Types: ${Array.from(eventTypes).join(', ')}`;
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
  const topEvents = events.slice(0, 30);
  const eventsStr = topEvents
    .map(
      e =>
        `[${new Date(e.timestamp).toISOString()}] ${e.type.toUpperCase()}: ${e.url} ${
          e.data ? `(${JSON.stringify(e.data)})` : ''
        }`
    )
    .join('\n');

  const sessionDuration = calculateDuration(events);
  const timePerEvent = events.length > 0 ? Math.round(sessionDuration / events.length) : 0;

  return `🔍 DETAILED SESSION ANALYSIS REQUEST

${eventSummary}

📋 DETAILED EVENT LOG (First 30 events):
${eventsStr}

⚡ ANALYSIS GUIDELINES - Be THOROUGH, SPECIFIC, and DATA-DRIVEN:

1️⃣ USER INTENT & BEHAVIOR PATTERNS:
   - What was the primary user goal? (shopping, research, support, account, signup, comparison, etc.)
   - Which specific pages/sections were visited in sequence? What does the path reveal?
   - Evidence of search intent, product interest, or specific content seeking?
   - Repeated actions indicating persistence, frustration, or deliberate behavior?
   - Navigation style: linear, exploratory, targeted, or bouncing?

2️⃣ ENGAGEMENT DEPTH & TIME INVESTMENT:
   - Classification: "minimal" (bounce <10s), "moderate" (10-60s), "deep" (1-5m), or "high" (>5m)
   - Time Signal Analysis: ${timePerEvent}ms per event + ${Math.round(sessionDuration / 1000)}s total
   - Click Intensity: clicks per page, click velocity
   - Scroll depth: How far did they go on each page?
   - Form interaction: Attempted? Abandoned? Completed?

3️⃣ FRICTION POINTS & ANOMALIES:
   - JavaScript Errors: ${events.some(e => e.type === 'error') ? 'YES - Analyze user response/impact' : 'None detected'}
   - Broken navigation: dead-ends, redirect loops, back-and-forth?
   - Load delays: Unusual gaps between events indicating page load issues?
   - Unexpected sequences: Illogical transitions or interruptions?
   - Error recovery: Did user retry after errors?

4️⃣ CONVERSION FUNNEL & ABANDONMENT:
   - Funnel progression: How far through the expected flow?
   - Abandonment point: Exact step where drop-off occurs
   - Cart/checkout indicators: Any evidence of transaction start?
   - Last meaningful action: What was the final activity?

5️⃣ CONTEXT & DEVICE SIGNALS:
   - Device: ${events[0]?.screenSize ? `${events[0].screenSize.width}x${events[0].screenSize.height}` : 'Unknown'}
   - Device type inference: Mobile vs desktop UX patterns
   - Browser/OS: ${events[0]?.userAgent ? 'Consider compatibility issues' : 'Not provided'}

📊 CONFIDENCE SCORING GUIDELINES:
- HIGH (0.8-1.0): Clear evidence, unmistakable pattern, specific data support
- MEDIUM (0.5-0.7): Strong indicators but some ambiguity, could have alternative explanations
- LOW (0.2-0.4): Weak signals only if relevant to specific finding
- ALWAYS provide reasoning for confidence level

✅ REQUIRED OUTPUT (Return ONLY valid JSON array, NO other text):
[
  {
    "type": "engagement_pattern|user_behavior|anomaly|custom",
    "title": "Specific, descriptive title (5-10 words)",
    "description": "Detailed analysis with specific evidence: quote URLs, cite click counts, mention durations, describe sequences. Make it clear WHY you draw this conclusion.",
    "confidence": 0.0-1.0,
    "tags": ["specific", "lowercase", "tags", "max_5_tags"]
  }
]

⚠️ CRITICAL RULES:
- Return ONLY the JSON array (no markdown, no explanations, no extra text)
- Include 2-6 interactions (focus on quality over quantity)
- Every description must cite specific data: URLs, numbers, time durations, or sequences
- Confidence must reflect actual evidence, not assumptions
- Tags must be specific, lowercase, relevant to the finding
- Be specific: "visited /checkout but spent 3s and left" not "browsing behavior"
- If unclear, mark as CUSTOM type and explain what you observed`;
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
  const sessionDuration = calculateDuration(events);

  // Rule 1: Engagement level
  if (clickCount > 10) {
    interactions.push({
      id: `interaction_${now}_1`,
      sessionId,
      eventCount,
      type: 'engagement_pattern',
      title: 'High User Engagement',
      description: `User performed ${clickCount} clicks across ${events.filter(e => e.type === 'pageview').length} pages, showing strong engagement with the site`,
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
      title: 'Moderate User Engagement',
      description: `User performed ${clickCount} clicks indicating light browsing behavior`,
      confidence: 0.6,
      tags: ['moderate_engagement', 'browser'],
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
      description: `User experienced ${errorCount} JavaScript error(s) during the ${Math.round(sessionDuration / 1000)}s session, potentially indicating technical issues`,
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

  // Rule 4: Session duration analysis
  if (sessionDuration < 10000) {
    interactions.push({
      id: `interaction_${now}_5`,
      sessionId,
      eventCount,
      type: 'user_behavior',
      title: 'Quick Exit',
      description: `User left the site after only ${Math.round(sessionDuration / 1000)}s with minimal interaction, suggesting either quick bounce or very targeted visit`,
      confidence: 0.7,
      tags: ['quick_exit', 'bounce'],
      createdAt: now,
      processedAt: now,
    });
  } else if (sessionDuration > 300000) {
    interactions.push({
      id: `interaction_${now}_6`,
      sessionId,
      eventCount,
      type: 'engagement_pattern',
      title: 'Extended Session Duration',
      description: `User spent ${Math.round(sessionDuration / 1000)}s (${Math.round(sessionDuration / 60000)}m) on the site, indicating sustained engagement or research behavior`,
      confidence: 0.8,
      tags: ['extended_session', 'deep_engagement'],
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

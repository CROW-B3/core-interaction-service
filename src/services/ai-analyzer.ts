import type { Interaction, SessionEvent } from '../db/schema';

export interface AIAnalysisResult {
  interactions: Interaction[];
  summary: string;
}

/**
 * Analyze session events using Cloudflare Workers AI
 * Uses the best available model with advanced prompting techniques
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
    const prompt = buildAnalysisPrompt(
      sessionId,
      eventCount,
      eventSummary,
      events
    );

    // Try best models first, with fallbacks
    const modelIds = [
      'workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      '@cf/mistral/mistral-7b-instruct-v0.2',
      '@cf/meta/llama-2-7b-chat-int8',
    ];

    let response;
    let lastError: any;

    for (const modelId of modelIds) {
      try {
        console.warn(`Attempting analysis with model: ${modelId}`);
        response = await env.AI.run(modelId, {
          messages: [
            {
              role: 'system',
              content: buildSystemPrompt(),
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
        });
        console.warn(`✓ Successfully used model: ${modelId}`);
        break;
      } catch (modelError) {
        lastError = modelError;
        console.warn(`Model ${modelId} failed, trying next...`);
        continue;
      }
    }

    if (!response) {
      throw lastError || new Error('No models available for analysis');
    }

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
 * Build the expert system prompt for precise analysis
 */
function buildSystemPrompt(): string {
  return `You are an elite user behavior analyst with expertise in:
- E-commerce conversion optimization and funnel analysis
- User experience (UX) and interaction patterns
- Technical issue detection and impact assessment
- Customer journey mapping and pain point identification
- Session quality and engagement scoring

Your analysis approach:
1. IDENTIFY INTENT: Determine what users actually want to achieve
2. MEASURE ENGAGEMENT: Quantify effort, persistence, and satisfaction signals
3. DETECT FRICTION: Find obstacles, errors, and abandonment triggers
4. INFER BUSINESS IMPACT: Explain how findings affect revenue, retention, or satisfaction
5. PROVIDE RECOMMENDATIONS: Suggest specific, actionable improvements

Your output should be:
- PRECISE: Cite exact URLs, timestamps, and event counts
- ACTIONABLE: Focus on insights that drive decisions
- CONFIDENT: Only state findings you can justify with data
- BUSINESS-FOCUSED: Frame insights in terms of business impact (revenue, retention, satisfaction)
- JSON-ONLY: Return ONLY valid JSON array, no explanations

Remember: Your goal is to extract maximum insight from limited data. Be thorough and find patterns others might miss.`;
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

  const clickCount = eventCounts.click || 0;
  const errorCount = eventCounts.error || 0;
  const formCount = eventCounts.form || 0;
  const pageviewCount = eventCounts.pageview || 0;
  const sessionDuration = calculateDuration(events);
  const avgTimePerEvent =
    events.length > 0 ? Math.round(totalDwell / events.length) : 0;

  return `📊 SESSION ANALYTICS:
- Total Events: ${events.length} | Unique URLs: ${urls.size}
- Pageviews: ${pageviewCount} | Clicks: ${clickCount} | Forms: ${formCount} | Errors: ${errorCount}
- Session Duration: ${sessionDuration}ms (${Math.round(sessionDuration / 1000)}s total)
- Avg Time Per Event: ${avgTimePerEvent}ms
- User Path: ${urlSequence.slice(0, 5).join(' → ')}${urlSequence.length > 5 ? ` → (${urlSequence.length - 5} more)` : ''}
- Event Types: ${Array.from(eventTypes).join(', ')}`;
}

/**
 * Build analysis prompt with advanced prompting techniques
 */
function buildAnalysisPrompt(
  sessionId: string,
  eventCount: number,
  eventSummary: string,
  events: SessionEvent[]
): string {
  const topEvents = events.slice(0, 50);
  const eventsStr = topEvents
    .map((e, idx) => {
      const timestamp = new Date(e.timestamp).toISOString();
      const dataStr = e.data ? JSON.stringify(e.data) : '';
      return `${idx + 1}. [${timestamp}] ${e.type.toUpperCase()}: ${e.url}${dataStr ? ` → ${dataStr}` : ''}`;
    })
    .join('\n');

  const sessionDuration = calculateDuration(events);
  const timePerEvent =
    events.length > 0 ? Math.round(sessionDuration / events.length) : 0;
  const clickCount = events.filter(e => e.type === 'click').length;
  const errorCount = events.filter(e => e.type === 'error').length;
  const formCount = events.filter(e => e.type === 'form').length;

  return `═══════════════════════════════════════════════════════════════════════════════
🎯 COMPREHENSIVE SESSION ANALYSIS TASK
═══════════════════════════════════════════════════════════════════════════════

SESSION METADATA:
• Session ID: ${sessionId}
• Total Events: ${events.length}
• Duration: ${Math.round(sessionDuration / 1000)}s (${Math.round(sessionDuration / 60000)}m)
• Events per second: ${(events.length / (sessionDuration / 1000)).toFixed(1)}
${eventSummary}

═══════════════════════════════════════════════════════════════════════════════
📋 DETAILED EVENT LOG (First 50 events for context):
═══════════════════════════════════════════════════════════════════════════════
${eventsStr}

═══════════════════════════════════════════════════════════════════════════════
🔍 ANALYSIS INSTRUCTIONS - THINK STEP BY STEP:
═══════════════════════════════════════════════════════════════════════════════

STEP 1️⃣ - DETERMINE USER INTENT (What do they want?):
Analyze the sequence of URLs and actions to infer primary goal:
  • Shopping? (browsing products, adding to cart, checkout)
  • Research/Comparison? (visiting multiple product pages, reading reviews)
  • Support/Help? (FAQ, contact forms, troubleshooting)
  • Account management? (login, profile updates, settings)
  • Problem-solving? (specific error recovery pattern)
  • Browse/Discovery? (random exploration, browsing without clear goal)

Ask yourself: If you were this user, what would you be trying to accomplish?

STEP 2️⃣ - QUANTIFY ENGAGEMENT QUALITY:
Measure effort and persistence signals:
  • Time investment: ${timePerEvent}ms/event over ${Math.round(sessionDuration / 1000)}s
  • Click intensity: ${clickCount} total clicks = ${(clickCount / (sessionDuration / 1000)).toFixed(2)} clicks/second
  • Form engagement: ${formCount} form interactions (commitment signal)
  • Pages visited: Count unique URLs in sequence
  • Engagement tier:
    - "BOUNCE" (< 5 seconds, 0-2 clicks): User immediately left
    - "MINIMAL" (5-30 seconds, 2-5 clicks): Quick visit, low investment
    - "MODERATE" (30-120 seconds, 5-15 clicks): Browsing behavior, some interest
    - "DEEP" (2-10 minutes, 15-50 clicks): Strong engagement, deliberate exploration
    - "INTENSIVE" (>10 minutes, >50 clicks): Power user, research mode, or stuck/frustrated

STEP 3️⃣ - IDENTIFY FRICTION & PAIN POINTS:
Spot where things went wrong or slowed down:
  • JavaScript Errors: ${errorCount} detected → User impact?
  • Time gaps: Look for 3+ second pauses (page load delays?)
  • Back-and-forth navigation: Loops or dead ends?
  • Form abandonment: Started form, didn't complete?
  • Error recovery: Did user retry after failure?
  • Conversion leakage: Visitors who almost completed but bounced?

STEP 4️⃣ - MAP CONVERSION FUNNEL PROGRESSION:
Trace how far through the expected journey:
  • Awareness stage: Landing page → product browsing
  • Consideration stage: Product details, reviews, comparisons
  • Decision stage: Add to cart, start checkout
  • Action stage: Complete purchase, form submission, contact
  • Current stage: Where did this user stop?
  • Abandonment: Why did they leave? Price, complexity, distraction, error?

STEP 5️⃣ - EXTRACT BUSINESS-VALUABLE INSIGHTS:
Frame findings in terms that drive business decisions:
  • Revenue impact: Does this pattern affect conversion? By how much?
  • Retention signal: Would this user return? (enthusiasm, frustration level)
  • Support burden: Are they stuck? Would support/help increase conversion?
  • Product insight: Is something broken or confusing for users?
  • UX opportunity: What change would most improve this experience?

═══════════════════════════════════════════════════════════════════════════════
✨ FEW-SHOT EXAMPLES (Reference for quality analysis):
═══════════════════════════════════════════════════════════════════════════════

GOOD ANALYSIS ✓:
{
  "type": "anomaly",
  "title": "Checkout Error Preventing Purchase Completion",
  "description": "User viewed 5 products over 120s, added item to cart at event #12, entered checkout at #18. At event #22 (T+95s), experienced JavaScript error on payment page. Did not retry. Abandoned at 85% through funnel. Business impact: 1 lost conversion (~\$50-200 depending on AOV). Recommendation: Debug payment form errors, add retry mechanism.",
  "confidence": 0.95,
  "tags": ["checkout_error", "conversion_loss", "payment_friction", "critical"]
}

GOOD ANALYSIS ✓:
{
  "type": "user_behavior",
  "title": "High-Intent Mobile Shopper with Quick Purchase Decision",
  "description": "Mobile user (375x667) visited 3 product pages in 45s, spent 20s average per product, directly added item from product detail page to cart (event #8), proceeded to checkout immediately. Strong purchase intent signals: minimal browsing, direct action path, time efficiency. Likely to convert. Recommendation: Streamline cart/checkout for mobile to capitalize on intent.",
  "confidence": 0.92,
  "tags": ["high_intent", "mobile_optimized", "purchase_ready"]
}

GOOD ANALYSIS ✓:
{
  "type": "engagement_pattern",
  "title": "Extensive Product Research Pattern - Comparison Shopper",
  "description": "User systematically compared 9 products over 8 minutes (480s total, 50+ clicks). Visited product pages multiple times, returned to category page 4 times. Scrolled through full specifications on 6 products. Dwell time: 30-40s per product page. Left without purchase after thorough research. Pattern: Classic comparison shopper, likely researching before buying elsewhere or reconsidering budget. Recommendation: Implement price-match guarantee, customer reviews, or waiting period retargeting.",
  "confidence": 0.87,
  "tags": ["research_mode", "competitor_comparison", "price_sensitive"]
}

═══════════════════════════════════════════════════════════════════════════════
📊 RESPONSE FORMAT & REQUIREMENTS:
═══════════════════════════════════════════════════════════════════════════════

Return ONLY valid JSON array. No markdown, no code blocks, no explanations.

[
  {
    "type": "engagement_pattern|user_behavior|anomaly|custom",
    "title": "Specific, actionable title (5-10 words, business-focused)",
    "description": "Detailed analysis citing: specific URLs visited, exact event numbers, timestamps, click counts, duration measurements. Explain reasoning. Include business impact if significant. Format: 'User [action] at [time], resulting in [outcome]. Evidence: [specific data]. Impact: [business relevance].'",
    "confidence": 0.0-1.0,
    "tags": ["tag1", "tag2", "tag3"]
  }
]

CONFIDENCE LEVELS:
- 0.95-1.0 HIGH: Crystal clear pattern, undeniable evidence, specific data support
- 0.80-0.94 STRONG: Very likely true, clear intent visible, minor ambiguity
- 0.65-0.79 MODERATE: Good indicators but could have alternative explanation
- 0.50-0.64 WEAK: Possible pattern but needs more data to confirm
- Below 0.50: Only include if genuinely useful insight despite low confidence

═══════════════════════════════════════════════════════════════════════════════
⚡ CRITICAL RULES - FOLLOW THESE EXACTLY:
═══════════════════════════════════════════════════════════════════════════════

✓ MUST DO:
  1. Return ONLY the JSON array (start with '[', end with ']')
  2. Generate 2-6 high-quality insights (quality > quantity)
  3. Cite specific data: URLs, event numbers, timestamps, counts
  4. Frame findings as business-relevant (revenue, retention, support needs)
  5. Bold statements with evidence: "because event #18 shows..."
  6. Tag should highlight key themes: intent_clear, high_engagement, friction_detected, etc.

✗ MUST NOT DO:
  1. Include markdown, code blocks, or explanatory text
  2. Make claims without specific data support
  3. Use vague language: "user was browsing" → be specific: "user browsed 5 products in 60s"
  4. Generate more than 6 findings (focus on the most valuable)
  5. Include findings you can't justify with the event log
  6. Forget to analyze timestamps and calculate time intervals

═══════════════════════════════════════════════════════════════════════════════
START YOUR ANALYSIS NOW (thinking step by step):
═══════════════════════════════════════════════════════════════════════════════`;
}

/**
 * Parse AI response and create interactions
 */
function parseAIResponse(
  response: any,
  sessionId: string,
  eventCount: number
): Interaction[] {
  try {
    const content = response?.result?.response || response?.toString() || '';

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
  let formFilledOut = false;

  for (const event of events) {
    eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;
    if (event.type === 'form' && event.data?.success) formFilledOut = true;
  }

  const clickCount = eventCounts.click || 0;
  const errorCount = eventCounts.error || 0;
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

import type { Ai } from '@cloudflare/workers-types';
import type {
  AgentInsight,
  AgentResult,
  MultiAgentAnalysisResult,
  SessionEvent,
} from './types';

const ANALYSIS_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const VISION_MODEL = '@cf/llava-hf/llava-1.5-7b-hf';

const MAX_RETRIES = 5;
const INITIAL_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;
const BACKOFF_MULTIPLIER = 2;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  operationName: string,
  maxRetries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;
  let delay = INITIAL_DELAY_MS;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const errorMessage = lastError.message || String(error);

      const isRetryable =
        errorMessage.includes('1031') || // Rate limit
        errorMessage.includes('rate') ||
        errorMessage.includes('limit') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('503') ||
        errorMessage.includes('502') ||
        errorMessage.includes('429');

      if (!isRetryable || attempt === maxRetries) {
        console.error(
          `[Retry] ${operationName} failed after ${attempt} attempts: ${errorMessage}`
        );
        throw lastError;
      }

      const jitter = Math.random() * 0.3 * delay;
      const sleepTime = Math.min(delay + jitter, MAX_DELAY_MS);

      console.warn(
        `[Retry] ${operationName} attempt ${attempt}/${maxRetries} failed. Retrying in ${Math.round(sleepTime)}ms...`
      );

      await sleep(sleepTime);
      delay *= BACKOFF_MULTIPLIER;
    }
  }

  throw lastError;
}

async function runAgent(
  ai: Ai,
  agentName: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 2000
): Promise<AgentResult> {
  const startTime = Date.now();

  const response = await withRetry(
    async () =>
      ai.run(
        ANALYSIS_MODEL as any,
        {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: maxTokens,
          temperature: 0.7,
        },
        { gateway: { id: 'crow-ai-gateway', skipCache: false } }
      ),
    `Agent: ${agentName}`
  );

  const analysisTime = Date.now() - startTime;
  const rawAnalysis = (response as any).response || '';

  const insights = parseInsightsFromResponse(rawAnalysis, agentName);

  return {
    agentName,
    analysisTime,
    insights,
    rawAnalysis,
  };
}

function parseInsightsFromResponse(
  response: string,
  agentName: string
): AgentInsight[] {
  const insights: AgentInsight[] = [];

  // Split by common delimiters and extract insights
  const lines = response.split('\n').filter(line => line.trim());

  let currentInsight: Partial<AgentInsight> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^(?:\d+\.|[-•]|\*{1,2}|##)/.test(trimmed)) {
      if (currentInsight?.observation) {
        insights.push({
          category: agentName,
          observation: currentInsight.observation,
          evidence: currentInsight.evidence || [],
          severity: currentInsight.severity || 'info',
          confidence: currentInsight.confidence || 0.7,
          recommendations: currentInsight.recommendations,
        });
      }

      currentInsight = {
        observation: trimmed.replace(/^(\d+\.|[-•*]|\*\*|##)\s*/, ''),
        evidence: [],
        severity: determineSeverity(trimmed),
        confidence: 0.8,
      };
    } else if (currentInsight && trimmed) {
      currentInsight.evidence = currentInsight.evidence || [];
      currentInsight.evidence.push(trimmed);
    }
  }

  if (currentInsight?.observation) {
    insights.push({
      category: agentName,
      observation: currentInsight.observation,
      evidence: currentInsight.evidence || [],
      severity: currentInsight.severity || 'info',
      confidence: currentInsight.confidence || 0.7,
    });
  }

  return insights;
}

function determineSeverity(text: string): 'info' | 'warning' | 'critical' {
  const lower = text.toLowerCase();
  if (
    lower.includes('critical') ||
    lower.includes('severe') ||
    lower.includes('urgent') ||
    lower.includes('rage')
  ) {
    return 'critical';
  }
  if (
    lower.includes('warning') ||
    lower.includes('issue') ||
    lower.includes('problem') ||
    lower.includes('friction')
  ) {
    return 'warning';
  }
  return 'info';
}

async function runBehavioralPsychologist(
  ai: Ai,
  events: SessionEvent[],
  sessionContext: string
): Promise<AgentResult> {
  const systemPrompt = `You are Dr. Sarah Chen, a Lead Behavioral Psychologist with 15 years of experience analyzing digital behavior patterns. You have a PhD in Cognitive Psychology from Stanford and have published extensively on online decision-making and digital habit formation.

Your expertise includes:
- Dual-process theory (System 1 vs System 2 thinking) in digital contexts
- Cognitive load assessment in user interfaces
- Decision fatigue and choice architecture
- Behavioral economics principles (loss aversion, anchoring, framing)
- Habit loop identification (cue, routine, reward)
- Attention patterns and focus indicators

You MUST provide detailed, evidence-based psychological analysis. For each observation, cite specific events as evidence. Be thorough - your analysis should take significant cognitive effort to produce.`;

  const userPrompt = `Analyze the following user session from a behavioral psychology perspective.

${sessionContext}

EVENTS TO ANALYZE:
${JSON.stringify(events, null, 2)}

Provide a COMPREHENSIVE behavioral analysis covering:

1. **DECISION-MAKING PATTERNS**
   - What decision-making style does this user exhibit? (Systematic vs. impulsive)
   - Evidence of satisficing vs. maximizing behavior
   - Analysis of choice points and decision latency

2. **COGNITIVE LOAD INDICATORS**
   - Signs of cognitive overload (back-navigation, hesitation, errors)
   - Information processing speed indicators
   - Working memory demands based on navigation complexity

3. **GOAL ORIENTATION**
   - Primary vs. secondary goals identified
   - Goal persistence indicators
   - Goal abandonment or pivoting evidence

4. **BEHAVIORAL BIASES OBSERVED**
   - Specific cognitive biases detected (anchoring, confirmation bias, etc.)
   - How these biases influenced the user journey
   - Potential exploitation or mitigation opportunities

5. **EMOTIONAL STATE INDICATORS**
   - Frustration signals (rapid clicking, back-navigation)
   - Engagement indicators (dwell time, scroll depth)
   - Confidence/uncertainty markers

6. **LEARNING CURVE ANALYSIS**
   - Adaptation patterns throughout the session
   - Error recovery behaviors
   - Skill acquisition indicators

Be EXTREMELY thorough. Each point should have specific event citations as evidence.`;

  return runAgent(
    ai,
    'Behavioral Psychologist',
    systemPrompt,
    userPrompt,
    3000
  );
}

async function runUXResearcher(
  ai: Ai,
  events: SessionEvent[],
  sessionContext: string
): Promise<AgentResult> {
  const systemPrompt = `You are Marcus Webb, a Senior UX Research Analyst with 12 years of experience conducting user studies for Fortune 500 companies. You have a background in Human Factors Engineering and have led research at companies like Google, Airbnb, and Stripe.

Your expertise includes:
- Heuristic evaluation (Nielsen's 10 usability heuristics)
- Task flow analysis and optimization
- Information architecture assessment
- Accessibility and inclusive design evaluation
- Mobile vs. desktop interaction patterns
- Error prevention and recovery design
- Micro-interaction effectiveness

You provide actionable, specific UX recommendations backed by industry best practices and research. Your analysis should be thorough enough to inform a complete UX audit.`;

  const userPrompt = `Conduct a comprehensive UX research analysis of this user session.

${sessionContext}

EVENTS TO ANALYZE:
${JSON.stringify(events, null, 2)}

Provide a DETAILED UX analysis covering:

1. **USABILITY HEURISTIC VIOLATIONS**
   - Visibility of system status issues
   - Match between system and real world problems
   - User control and freedom concerns
   - Consistency and standards violations
   - Error prevention failures
   - Recognition vs. recall issues
   - Flexibility and efficiency problems
   - Aesthetic and minimalist design concerns

2. **TASK FLOW ANALYSIS**
   - Optimal path vs. actual path taken
   - Unnecessary steps identified
   - Dead ends or confusion points
   - Task completion efficiency score

3. **NAVIGATION PATTERNS**
   - Information scent indicators
   - Wayfinding issues
   - Back-navigation frequency and causes
   - Search vs. browse behavior

4. **INTERACTION FRICTION POINTS**
   - Specific moments of hesitation
   - Form interaction issues
   - Click target problems
   - Scroll behavior anomalies

5. **DEVICE/CONTEXT CONSIDERATIONS**
   - Mobile-specific issues (if applicable)
   - Viewport utilization
   - Touch vs. click patterns

6. **ACCESSIBILITY CONCERNS**
   - Potential accessibility barriers observed
   - Keyboard navigation indicators
   - Screen reader compatibility signals

Provide SPECIFIC, ACTIONABLE recommendations for each issue found.`;

  return runAgent(ai, 'UX Researcher', systemPrompt, userPrompt, 3000);
}

async function runIntentClassifier(
  ai: Ai,
  events: SessionEvent[],
  sessionContext: string
): Promise<AgentResult> {
  const systemPrompt = `You are Dr. Priya Sharma, a Consumer Psychology Expert specializing in online shopping behavior and digital purchase journeys. You have 20 years of experience and have consulted for major e-commerce platforms including Amazon, Shopify, and eBay.

Your expertise includes:
- Buyer journey mapping and funnel analysis
- Purchase intent signal detection
- Micro-conversion identification
- Abandonment psychology and recovery
- Trust signal effectiveness
- Persuasion technique analysis
- Customer segment behavior patterns
- Cross-device journey understanding

You excel at detecting subtle intent signals that predict conversion or abandonment.`;

  const userPrompt = `Analyze user intent and purchase/conversion signals from this session.

${sessionContext}

EVENTS TO ANALYZE:
${JSON.stringify(events, null, 2)}

Provide COMPREHENSIVE intent analysis covering:

1. **PRIMARY INTENT CLASSIFICATION**
   - Browsing/Research intent
   - Comparison shopping intent
   - Purchase-ready intent
   - Support/Help-seeking intent
   - Return/Exchange intent
   - Confidence score for classification

2. **INTENT EVOLUTION**
   - How did intent change throughout the session?
   - Trigger points for intent shifts
   - Intent strengthening/weakening signals

3. **MICRO-CONVERSION ANALYSIS**
   - Which micro-conversions occurred?
   - Which were missed opportunities?
   - Progression through the funnel

4. **PURCHASE READINESS SIGNALS**
   - High-intent behaviors observed
   - Price sensitivity indicators
   - Urgency indicators
   - Comparison behavior

5. **ABANDONMENT RISK FACTORS**
   - Early warning signs detected
   - Point-of-no-return indicators
   - Recovery opportunities identified

6. **TRUST AND CONFIDENCE SIGNALS**
   - Trust-seeking behaviors
   - Confidence indicators
   - Hesitation at high-commitment points

7. **SEGMENT HYPOTHESIS**
   - Likely customer segment
   - Behavioral profile match
   - Personalization opportunities`;

  return runAgent(ai, 'Intent Classifier', systemPrompt, userPrompt, 3000);
}

async function runEngagementAnalyst(
  ai: Ai,
  events: SessionEvent[],
  sessionContext: string
): Promise<AgentResult> {
  const systemPrompt = `You are Alex Rodriguez, an Engagement Metrics Specialist and former Product Analyst at Netflix and Spotify. You have deep expertise in quantitative analysis of user engagement and attention patterns.

Your expertise includes:
- Attention metrics (scroll depth, time on page, focus time)
- Interaction frequency and intensity analysis
- Session quality scoring methodologies
- Feature adoption measurement
- Retention predictor identification
- Engagement funnel optimization
- A/B test metric interpretation
- Statistical significance in behavioral data

You provide data-driven insights with quantitative backing whenever possible.`;

  const userPrompt = `Perform a detailed engagement analysis of this user session.

${sessionContext}

EVENTS TO ANALYZE:
${JSON.stringify(events, null, 2)}

Calculate and analyze:

1. **ENGAGEMENT SCORE CALCULATION**
   - Overall session engagement score (0-100)
   - Component scores breakdown
   - Methodology explanation

2. **ATTENTION METRICS**
   - Time on page analysis
   - Scroll depth patterns
   - Focus vs. idle time estimation
   - Attention distribution across pages

3. **INTERACTION INTENSITY**
   - Clicks per minute
   - Interaction density
   - Active vs. passive engagement ratio
   - Peak engagement moments

4. **CONTENT ENGAGEMENT**
   - Most engaged content areas
   - Least engaged content areas
   - Content consumption patterns
   - Read depth vs. skim behavior

5. **SESSION QUALITY INDICATORS**
   - Session health score
   - Bounce risk indicators
   - Return visit predictors
   - Lifetime value signals

6. **TEMPORAL PATTERNS**
   - Session rhythm analysis
   - Time-based engagement curves
   - Optimal session length estimation

7. **COMPARATIVE BENCHMARKS**
   - How does this session compare to typical patterns?
   - Outlier behaviors identified
   - Segment-specific comparisons`;

  return runAgent(ai, 'Engagement Analyst', systemPrompt, userPrompt, 3000);
}

async function runAnomalyDetector(
  ai: Ai,
  events: SessionEvent[],
  sessionContext: string
): Promise<AgentResult> {
  const systemPrompt = `You are Dr. James Liu, an HCI Research Investigator specializing in interaction anomaly detection and user experience forensics. You have a PhD from MIT Media Lab and have developed algorithms for detecting frustration and confusion in digital interfaces.

Your expertise includes:
- Rage click detection and analysis
- Dead click identification
- Thrashing behavior patterns
- Error cascade detection
- Confusion loop identification
- Bot vs. human behavior differentiation
- Accessibility struggle detection
- Performance-related behavior changes

You are exceptionally skilled at finding the "invisible" problems that users experience but rarely report.`;

  const userPrompt = `Perform anomaly detection and interaction forensics on this session.

${sessionContext}

EVENTS TO ANALYZE:
${JSON.stringify(events, null, 2)}

Identify and analyze:

1. **RAGE CLICK DETECTION**
   - Any rapid repeated clicks on same element?
   - Click velocity anomalies
   - Frustration indicators

2. **DEAD CLICK ANALYSIS**
   - Clicks on non-interactive elements
   - Expected interactions that didn't happen
   - Click target misses

3. **NAVIGATION ANOMALIES**
   - Unusual back-navigation patterns
   - Circular navigation loops
   - Unexpected route deviations
   - Pogo-sticking behavior

4. **TIMING ANOMALIES**
   - Unusually long pauses (confusion?)
   - Unusually rapid actions (frustration?)
   - Irregular interaction timing

5. **ERROR PATTERNS**
   - Error frequency and clustering
   - Error recovery success/failure
   - Repeated same errors

6. **THRASHING BEHAVIOR**
   - Rapid context switching
   - Undo/redo patterns
   - Scroll thrashing

7. **ACCESSIBILITY STRUGGLES**
   - Potential keyboard-only navigation attempts
   - Zoom/resize behavior
   - Focus trap indicators

8. **PERFORMANCE IMPACT SIGNALS**
   - Behavior changes suggesting slow loading
   - Timeout-related patterns
   - Retry behaviors

Flag CRITICAL issues that need immediate attention.`;

  return runAgent(ai, 'Anomaly Detector', systemPrompt, userPrompt, 3000);
}

async function runSynthesisAgent(
  ai: Ai,
  allResults: AgentResult[],
  sessionContext: string
): Promise<{
  summary: string;
  keyFindings: string[];
  recommendations: string[];
}> {
  const systemPrompt = `You are the Lead UX Strategist responsible for synthesizing multiple expert analyses into actionable insights. You excel at finding patterns across different perspectives and prioritizing recommendations by impact.

Your job is to:
1. Identify the most critical findings across all analyses
2. Resolve any conflicting observations
3. Prioritize recommendations by impact and effort
4. Create an executive summary suitable for stakeholders
5. Provide a clear action plan`;

  const agentSummaries = allResults
    .map(r => {
      const topInsights = r.insights
        .slice(0, 10)
        .map(i => `- [${i.severity.toUpperCase()}] ${i.observation}`)
        .join('\n');
      return `\n=== ${r.agentName} (${r.insights.length} total insights) ===\nTop findings:\n${topInsights}`;
    })
    .join('\n');

  const userPrompt = `Synthesize the following expert analyses into a unified report.

${sessionContext}

AGENT SUMMARIES:
${agentSummaries}

Provide:

1. **EXECUTIVE SUMMARY** (2-3 paragraphs)
   A high-level overview of the session suitable for stakeholders

2. **KEY FINDINGS** (ranked by importance)
   - List the top 10 most important findings
   - Each finding should be a clear, actionable statement
   - Include severity level (Critical/Warning/Info)

3. **PRIORITIZED RECOMMENDATIONS**
   - Top 5 immediate actions (quick wins)
   - Top 5 strategic improvements (longer term)
   - Each with expected impact

4. **CROSS-CUTTING THEMES**
   - Patterns that multiple agents identified
   - Conflicting observations and resolution

Format your response clearly with headers.`;

  const response = await withRetry(
    async () =>
      ai.run(
        ANALYSIS_MODEL as any,
        {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 4000,
          temperature: 0.5,
        },
        { gateway: { id: 'crow-ai-gateway', skipCache: false } }
      ),
    'Synthesis Agent'
  );

  const rawResponse = (response as any).response || '';

  const keyFindings: string[] = [];
  const recommendations: string[] = [];

  const lines = rawResponse.split('\n');
  let inFindings = false;
  let inRecommendations = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase().includes('key finding')) inFindings = true;
    if (trimmed.toLowerCase().includes('recommendation'))
      inRecommendations = true;

    if (inFindings && /^[-•*\d]/.test(trimmed)) {
      keyFindings.push(trimmed.replace(/^[-•*\d.]\s*/, ''));
    }
    if (inRecommendations && /^[-•*\d]/.test(trimmed)) {
      recommendations.push(trimmed.replace(/^[-•*\d.]\s*/, ''));
    }
  }

  return {
    summary: rawResponse,
    keyFindings: keyFindings.slice(0, 15),
    recommendations: recommendations.slice(0, 10),
  };
}

export async function runMultiAgentAnalysis(
  ai: Ai,
  sessionId: string,
  events: SessionEvent[],
  metadata: {
    projectId: string;
    userId?: string;
    deviceType?: string;
    browser?: string;
    startedAt: number;
    endedAt: number;
  },
  _screenshots?: { timestamp: number; imageBase64: string }[]
): Promise<MultiAgentAnalysisResult> {
  const overallStartTime = Date.now();

  const sessionContext = `
SESSION METADATA:
- Session ID: ${sessionId}
- Project ID: ${metadata.projectId}
- User ID: ${metadata.userId || 'Anonymous'}
- Device: ${metadata.deviceType || 'Unknown'}
- Browser: ${metadata.browser || 'Unknown'}
- Duration: ${Math.round((metadata.endedAt - metadata.startedAt) / 1000)} seconds
- Total Events: ${events.length}
- Event Types: ${[...new Set(events.map(e => e.type))].join(', ')}
`;

  console.warn(
    `[Multi-Agent Analysis] Starting analysis for session ${sessionId}`
  );
  console.warn(`[Multi-Agent Analysis] ${events.length} events to analyze`);

  // Run all agents in parallel for speed, but they each take significant time
  const agentPromises = [
    runBehavioralPsychologist(ai, events, sessionContext),
    runUXResearcher(ai, events, sessionContext),
    runIntentClassifier(ai, events, sessionContext),
    runEngagementAnalyst(ai, events, sessionContext),
    runAnomalyDetector(ai, events, sessionContext),
  ];

  console.warn(`[Multi-Agent Analysis] Dispatching 5 specialist agents...`);

  const agentResults = await Promise.all(agentPromises);

  for (const result of agentResults) {
    console.warn(
      `[Multi-Agent Analysis] ${result.agentName} completed in ${result.analysisTime}ms with ${result.insights.length} insights`
    );
  }

  console.warn(`[Multi-Agent Analysis] Running synthesis agent...`);
  const synthesis = await runSynthesisAgent(ai, agentResults, sessionContext);

  const allInsights = agentResults.flatMap(r => r.insights);

  const totalTime = Date.now() - overallStartTime;
  console.warn(`[Multi-Agent Analysis] Complete! Total time: ${totalTime}ms`);

  return {
    sessionId,
    totalAnalysisTime: totalTime,
    agentResults,
    synthesizedInsights: allInsights,
    executiveSummary: synthesis.summary,
    keyFindings: synthesis.keyFindings,
    prioritizedRecommendations: synthesis.recommendations,
  };
}

export async function analyzeScreenshot(
  ai: Ai,
  imageBase64: string,
  context: string
): Promise<AgentInsight[]> {
  const response = await withRetry(
    async () =>
      ai.run(
        VISION_MODEL as any,
        {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `You are a UX expert analyzing a screenshot from a user session. ${context}

Analyze this screenshot and identify:
1. UI/UX issues visible (poor contrast, cluttered layout, confusing elements)
2. Accessibility concerns
3. Visual hierarchy problems
4. Call-to-action effectiveness
5. Information density issues

Provide specific, actionable observations.`,
                },
                {
                  type: 'image',
                  image: imageBase64,
                },
              ],
            },
          ],
          max_tokens: 1500,
        },
        { gateway: { id: 'crow-ai-gateway', skipCache: false } }
      ),
    'Vision Analyst'
  );

  const rawResponse = (response as any).response || '';

  return parseInsightsFromResponse(rawResponse, 'Visual Analyst');
}

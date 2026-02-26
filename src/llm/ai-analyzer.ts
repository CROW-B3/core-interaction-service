import type { AnalysisResult, NormalizedTimeline, SessionData } from '../types';
import { buildPrompt } from './prompt-builder';
import { parseAIResponse } from './response-parser';
import { generateRuleBasedAnalysis } from './rule-based-fallback';

/**
 * Ordered list of AI models to attempt. The analyzer tries each model in
 * sequence and falls back to the next if the current one fails or returns
 * an unparseable response.
 */
const MODEL_FALLBACK_CHAIN: string[] = [
  '@cf/mistralai/mistral-small-3.1-24b-instruct-2503',
  '@cf/qwen/qwen2.5-coder-32b-instruct',
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
];

/**
 * Orchestrates AI-based session analysis with a model fallback chain.
 *
 * For each model in the chain, the function:
 *  1. Builds the system and user prompts from session data.
 *  2. Calls the Cloudflare Workers AI binding.
 *  3. Parses the response into a typed AnalysisResult.
 *
 * If a model call fails or the response cannot be parsed, it logs a warning
 * and moves on to the next model.
 *
 * If all models fail, a deterministic rule-based analysis is generated as the
 * final fallback.
 *
 * @returns The analysis result together with the identifier of the model that
 *          produced it (or 'rule_based' for the fallback).
 */
export async function analyzeSession(
  ai: Ai,
  session: SessionData,
  timeline: NormalizedTimeline,
  domSnapshots: Map<string, string>
): Promise<{ result: AnalysisResult; modelUsed: string }> {
  const { system, user } = buildPrompt(session, timeline, domSnapshots);

  for (const model of MODEL_FALLBACK_CHAIN) {
    try {
      const aiResponse = (await ai.run(model as any, {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      })) as { response: string };

      const result = parseAIResponse(aiResponse.response);

      return { result, modelUsed: model };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `AI model ${model} failed: ${message}. Trying next model...`
      );
    }
  }

  // All AI models failed — fall back to deterministic rule-based analysis
  console.warn('All AI models failed. Falling back to rule-based analysis.');
  const result = generateRuleBasedAnalysis(session, timeline);

  return { result, modelUsed: 'rule_based' };
}

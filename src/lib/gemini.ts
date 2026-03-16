export interface GeminiAnalysis {
  people: Array<{
    description: string;
    location: string;
    activity: string;
  }>;
  interactions: string[];
  movement_patterns: string[];
  notable_events: string[];
  summary: string;
}

export interface GeminiClient {
  analyzeFrame: (
    imageBase64: string,
    previousSummary: string | null
  ) => Promise<GeminiAnalysis>;
}

const ANALYSIS_PROMPT = `You are analyzing a CCTV composite frame (mosaic of multiple camera views) from a retail store.

Describe what you observe in structured JSON format:
- "people": array of objects with "description" (appearance), "location" (which tile/area), "activity" (what they're doing)
- "interactions": array of strings describing interactions between people
- "movement_patterns": array of strings describing movement across camera views
- "notable_events": array of strings for anything unusual or significant
- "summary": a 1-2 sentence overview of this time period

Respond ONLY with valid JSON. No markdown fences.`;

const CONTEXT_PREFIX = `Here is the analysis from the previous time period for continuity. Track the same people across periods when possible:\n\n`;

export function createGeminiClient(apiKey: string): GeminiClient {
  return {
    async analyzeFrame(
      imageBase64: string,
      previousSummary: string | null
    ): Promise<GeminiAnalysis> {
      const parts: Array<Record<string, unknown>> = [];

      // System prompt
      let prompt = ANALYSIS_PROMPT;
      if (previousSummary) {
        prompt += `\n\n${CONTEXT_PREFIX}${previousSummary}`;
      }
      parts.push({ text: prompt });

      // Image
      parts.push({
        inline_data: {
          mime_type: 'image/jpeg',
          data: imageBase64,
        },
      });

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.2,
              maxOutputTokens: 2048,
            },
          }),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `Gemini API error ${response.status}: ${text.slice(0, 200)}`
        );
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('Gemini returned empty response');
      }

      return JSON.parse(text) as GeminiAnalysis;
    },
  };
}

from crewai import Agent, Task


def create_synthesis_task(agent: Agent, all_outputs: str) -> Task:
    return Task(
        description=(
            f"Synthesize all specialist outputs into a single structured analysis result.\n\n"
            f"Specialist outputs:\n{all_outputs}\n\n"
            f"Combine the web interaction analysis, CCTV behavior analysis, social sentiment "
            f"analysis, and product matching results into one unified output.\n\n"
            f"You MUST respond with ONLY valid JSON in this exact format (no markdown, "
            f"no explanation, no extra text):\n"
            f"{{\n"
            f'  "summary": "<markdown-formatted summary>",\n'
            f'  "tags": ["tag1", "tag2", "tag3"],\n'
            f'  "confidence": 0.85,\n'
            f'  "productIds": ["product-id-1"],\n'
            f'  "sentiment": "positive|negative|neutral|mixed"\n'
            f"}}\n\n"
            f"Rules for the summary field (CRITICAL):\n"
            f"- Write in proper markdown with sections using ## headings\n"
            f"- Start with a ## Key Findings section containing a 2-3 sentence overview\n"
            f"- Include a ## Channel Insights section with bullet points per channel analyzed\n"
            f"- Include a ## Actionable Recommendations section with concrete next steps as bullet points\n"
            f"- NEVER include organization IDs, UUIDs, internal identifiers, or any raw system IDs in the output\n"
            f"- Refer to the organization as 'your organization' or 'the team' instead of using IDs\n"
            f"- Use human-readable language throughout; no technical identifiers\n\n"
            f"Rules for other fields:\n"
            f"- tags: 3-10 descriptive tags covering key themes (human-readable, no IDs)\n"
            f"- confidence: weighted average of specialist confidence scores (0.0-1.0)\n"
            f"- productIds: all product IDs identified across channels (these are the only IDs allowed, and only in this field)\n"
            f"- sentiment: overall sentiment classification (exactly one of: positive, negative, neutral, mixed)"
        ),
        expected_output="JSON with markdown-formatted summary, tags, confidence, productIds, and sentiment",
        agent=agent,
    )

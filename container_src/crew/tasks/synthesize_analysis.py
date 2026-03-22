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
            f'  "summary": "2-3 sentence synthesis of all findings",\n'
            f'  "tags": ["tag1", "tag2", "tag3"],\n'
            f'  "confidence": 0.85,\n'
            f'  "productIds": ["product-id-1"],\n'
            f'  "sentiment": "positive|negative|neutral|mixed"\n'
            f"}}\n\n"
            f"Rules:\n"
            f"- summary: concise synthesis across all channels analyzed\n"
            f"- tags: 3-10 descriptive tags covering key themes\n"
            f"- confidence: weighted average of specialist confidence scores (0-1)\n"
            f"- productIds: all product IDs identified across channels\n"
            f"- sentiment: overall sentiment classification"
        ),
        expected_output="JSON with summary, tags, confidence, productIds, and sentiment",
        agent=agent,
    )

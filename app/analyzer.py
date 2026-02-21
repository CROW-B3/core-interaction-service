from crewai import Agent, Task, Crew, Process
import json

async def analyze_interactions(organization_id: str, interactions: list[dict], period: str) -> dict:
    interaction_summary = json.dumps(interactions[:50], indent=2)

    analyst = Agent(
        role="Customer Interaction Analyst",
        goal="Analyze customer interaction data and extract actionable insights",
        backstory="You are an expert retail analyst specializing in customer behavior analysis across web, CCTV, and social channels.",
        verbose=False,
        allow_delegation=False,
    )

    task = Task(
        description=f"""Analyze these customer interactions for organization {organization_id} over the {period} period.

Interactions data:
{interaction_summary}

Provide:
1. A comprehensive summary of interaction patterns
2. Key behavioral insights (list 3-5 specific insights)
3. Any anomalies or unusual patterns detected
4. Actionable recommendations for the business""",
        agent=analyst,
        expected_output="JSON with keys: summary, insights (list), anomalies (list), recommendations (list)",
    )

    crew = Crew(agents=[analyst], tasks=[task], process=Process.sequential, verbose=False)
    result = crew.kickoff()

    try:
        parsed = json.loads(str(result))
        return {
            "summary": parsed.get("summary", str(result)),
            "insights": parsed.get("insights", []),
            "anomalies": parsed.get("anomalies", []),
            "recommendations": parsed.get("recommendations", []),
        }
    except json.JSONDecodeError:
        return {"summary": str(result), "insights": [], "anomalies": [], "recommendations": []}

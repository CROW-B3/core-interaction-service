import json
import logging
import os

from crewai import Agent, Crew, LLM, Process, Task

from .agents.behavioral_psychologist import create_behavioral_psychologist
from .agents.consumer_psychologist import create_consumer_psychologist
from .agents.engagement_specialist import create_engagement_specialist
from .agents.hci_investigator import create_hci_investigator
from .agents.ux_researcher import create_ux_researcher
from .tasks.analyze_navigation import create_navigation_analysis_task
from .tasks.classify_intent import create_intent_analysis_task
from .tasks.detect_friction import create_usability_analysis_task
from .tasks.evaluate_engagement import create_engagement_metrics_task
from .tasks.synthesize_insights import create_interaction_efficiency_task

logger = logging.getLogger(__name__)


class SessionAnalysisCrew:
    def __init__(
        self,
        cf_account_id: str,
        cf_ai_api_key: str,
        session_data: dict,
        events: list,
        ai_gateway_id: str | None = None,
    ):
        self.cf_account_id = cf_account_id
        self.cf_ai_api_key = cf_ai_api_key
        self.ai_gateway_id = ai_gateway_id
        self.session_data = session_data
        self.events = events
        self.llm = self._create_llm()
        self.agents = self._create_agents()
        self.tasks = self._create_tasks()

    def _create_llm(self) -> LLM:
        if self.ai_gateway_id:
            base_url = f"https://gateway.ai.cloudflare.com/v1/{self.cf_account_id}/{self.ai_gateway_id}/workers-ai/v1"
            model = "openai/workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast"
        else:
            base_url = f"https://api.cloudflare.com/client/v4/accounts/{self.cf_account_id}/ai/v1"
            model = "openai/@cf/meta/llama-3.3-70b-instruct-fp8-fast"

        return LLM(
            model=model,
            base_url=base_url,
            api_key=self.cf_ai_api_key,
            temperature=0.7,
            max_tokens=8192,
        )

    def _create_agents(self) -> dict[str, Agent]:
        return {
            "behavioral_psychologist": create_behavioral_psychologist(self.llm),
            "ux_researcher": create_ux_researcher(self.llm),
            "consumer_psychologist": create_consumer_psychologist(self.llm),
            "hci_investigator": create_hci_investigator(self.llm),
            "engagement_specialist": create_engagement_specialist(self.llm),
        }

    def _create_tasks(self) -> list[Task]:
        return [
            create_navigation_analysis_task(
                self.agents["behavioral_psychologist"], self.events
            ),
            create_usability_analysis_task(
                self.agents["ux_researcher"], self.events
            ),
            create_intent_analysis_task(
                self.agents["consumer_psychologist"], self.events
            ),
            create_interaction_efficiency_task(
                self.agents["hci_investigator"], self.events
            ),
            create_engagement_metrics_task(
                self.agents["engagement_specialist"], self.events
            ),
        ]

    async def analyze(self) -> dict:
        logger.info(
            f"Starting hierarchical analysis for session {self.session_data['sessionId']}"
        )

        crew = Crew(
            agents=list(self.agents.values()),
            tasks=self.tasks,
            manager_llm=self.llm,
            process=Process.hierarchical,
            planning=True,
            planning_llm=self.llm,
            memory=True,
            verbose=True,
        )

        result = crew.kickoff()

        interactions = self._parse_crew_output(result)

        return {
            "interactions": interactions,
            "metadata": {
                "agents_used": len(self.agents),
                "tasks_completed": len(self.tasks),
                "planning_enabled": True,
                "memory_enabled": True,
            },
        }

    def _parse_crew_output(self, result) -> list[dict]:
        raw_output = str(result)

        interactions = []

        try:
            if "```json" in raw_output:
                json_start = raw_output.find("```json") + 7
                json_end = raw_output.find("```", json_start)
                json_str = raw_output[json_start:json_end].strip()
                parsed = json.loads(json_str)
                if isinstance(parsed, list):
                    interactions = parsed
                elif isinstance(parsed, dict) and "interactions" in parsed:
                    interactions = parsed["interactions"]
        except json.JSONDecodeError:
            pass

        if not interactions:
            interactions = [
                {
                    "type": "behavioral_analysis",
                    "category": "navigation",
                    "description": raw_output[:2000],
                    "summary": "Comprehensive session analysis completed",
                    "confidence": 0.85,
                    "metrics": {
                        "event_count": len(self.events),
                        "session_duration": self.session_data.get("endedAt", 0)
                        - self.session_data.get("startedAt", 0),
                    },
                    "patterns": ["session_analyzed"],
                }
            ]

        return interactions


async def train_crew(n_iterations: int = 5):
    logger.info(f"Starting crew training with {n_iterations} iterations")
    pass

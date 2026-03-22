import json
import logging

from crewai import Crew, LLM, Process, Task

from .agents.cctv_behavior_analyst import create_cctv_behavior_analyst
from .agents.product_matcher import create_product_matcher
from .agents.social_sentiment_analyst import create_social_sentiment_analyst
from .agents.synthesis_coordinator import create_synthesis_coordinator
from .agents.web_interaction_specialist import create_web_interaction_specialist
from .tasks.analyze_cctv_behavior import create_cctv_behavior_task
from .tasks.analyze_social_sentiment import create_social_sentiment_task
from .tasks.analyze_web_interactions import create_web_interaction_task
from .tasks.match_products import create_product_matching_task
from .tasks.synthesize_analysis import create_synthesis_task

logger = logging.getLogger(__name__)

DEFAULT_OUTPUT = {
    "summary": "",
    "tags": [],
    "confidence": 0.0,
    "productIds": [],
    "sentiment": "neutral",
}


class InteractionAnalysisCrew:
    def __init__(
        self,
        cf_account_id: str,
        cf_ai_api_key: str,
        interactions: list[dict],
        organization_id: str,
        ai_gateway_id: str | None = None,
    ):
        self.cf_account_id = cf_account_id
        self.cf_ai_api_key = cf_ai_api_key
        self.ai_gateway_id = ai_gateway_id
        self.interactions = interactions
        self.organization_id = organization_id
        self.llm = self._create_llm()

    def _create_llm(self) -> LLM:
        if self.ai_gateway_id:
            base_url = (
                f"https://gateway.ai.cloudflare.com/v1/"
                f"{self.cf_account_id}/{self.ai_gateway_id}/workers-ai/v1"
            )
            model = "openai/workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast"
        else:
            base_url = (
                f"https://api.cloudflare.com/client/v4/accounts/"
                f"{self.cf_account_id}/ai/v1"
            )
            model = "openai/@cf/meta/llama-3.3-70b-instruct-fp8-fast"

        return LLM(
            model=model,
            base_url=base_url,
            api_key=self.cf_ai_api_key,
            temperature=0.7,
            max_tokens=8192,
        )

    def _build_specialist_tasks(self) -> list[Task]:
        web_agent = create_web_interaction_specialist(self.llm)
        cctv_agent = create_cctv_behavior_analyst(self.llm)
        social_agent = create_social_sentiment_analyst(self.llm)

        return [
            create_web_interaction_task(web_agent, self.interactions),
            create_cctv_behavior_task(cctv_agent, self.interactions),
            create_social_sentiment_task(social_agent, self.interactions),
        ]

    def _build_all_tasks(self, specialist_outputs: str) -> list[Task]:
        product_agent = create_product_matcher(self.llm)
        synthesis_agent = create_synthesis_coordinator(self.llm)

        product_task = create_product_matching_task(
            product_agent, self.interactions, specialist_outputs
        )
        synthesis_task = create_synthesis_task(synthesis_agent, specialist_outputs)

        return [product_task, synthesis_task]

    async def analyze(self) -> dict:
        logger.info(
            f"Starting interaction analysis for org {self.organization_id} "
            f"with {len(self.interactions)} interactions"
        )

        specialist_tasks = self._build_specialist_tasks()
        specialist_agents = [t.agent for t in specialist_tasks]

        specialist_crew = Crew(
            agents=specialist_agents,
            tasks=specialist_tasks,
            process=Process.sequential,
            verbose=True,
        )

        specialist_result = specialist_crew.kickoff()
        specialist_outputs = str(specialist_result)

        follow_up_tasks = self._build_all_tasks(specialist_outputs)
        follow_up_agents = [t.agent for t in follow_up_tasks]

        synthesis_crew = Crew(
            agents=follow_up_agents,
            tasks=follow_up_tasks,
            manager_llm=self.llm,
            process=Process.hierarchical,
            verbose=True,
        )

        final_result = synthesis_crew.kickoff()
        return self._parse_final_output(str(final_result))

    def _parse_final_output(self, raw_output: str) -> dict:
        try:
            if "```json" in raw_output:
                start = raw_output.find("```json") + 7
                end = raw_output.find("```", start)
                return json.loads(raw_output[start:end].strip())
            return json.loads(raw_output.strip())
        except (json.JSONDecodeError, ValueError):
            pass

        json_match = self._extract_json_object(raw_output)
        if json_match:
            return json_match

        return {
            **DEFAULT_OUTPUT,
            "summary": raw_output[:500],
            "tags": ["analysis_completed"],
            "confidence": 0.5,
        }

    @staticmethod
    def _extract_json_object(text: str) -> dict | None:
        start = text.find("{")
        if start == -1:
            return None
        depth = 0
        for i in range(start, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start : i + 1])
                except json.JSONDecodeError:
                    return None
        return None

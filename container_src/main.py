import signal
import sys
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException
from loguru import logger
from pydantic import BaseModel

from crew.interaction_analysis_crew import InteractionAnalysisCrew
from crew.session_analysis_crew import SessionAnalysisCrew
from utils.config import get_config


def signal_handler(signum: Any, _: Any) -> None:
    logger.info(f"Received signal ({signal.Signals(signum).name}), shutting down...")
    sys.exit(0)


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("Core Interaction AI Analyzer starting up...")
    yield
    logger.info("Core Interaction AI Analyzer shutdown complete")


app = FastAPI(
    title="Core Interaction Service - AI Analyzer",
    lifespan=lifespan
)


class SessionEvent(BaseModel):
    id: str
    type: str
    timestamp: int
    url: str
    data: dict | None = None
    userAgent: str | None = None
    screenSize: dict | None = None


class SessionMetadata(BaseModel):
    sessionId: str
    projectId: str
    userId: str | None = None
    anonymousId: str
    startedAt: int
    endedAt: int
    eventCount: int
    metadata: dict


class AnalysisRequest(BaseModel):
    session: SessionMetadata
    events: list[SessionEvent]
    cfAccountId: str
    cfAiApiKey: str
    aiGatewayId: str | None = None


class InteractionResult(BaseModel):
    type: str
    category: str
    description: str
    summary: str
    confidence: float
    metrics: dict
    patterns: list[str]


class AnalysisResponse(BaseModel):
    success: bool
    interactions: list[InteractionResult]
    agentsUsed: int
    tasksCompleted: int


class InteractionItem(BaseModel):
    id: str
    sourceType: str
    sessionId: str | None = None
    data: str | None = None
    summary: str | None = None
    timestamp: int | None = None


class BatchAnalyzeRequest(BaseModel):
    organization_id: str
    interactions: list[InteractionItem]
    period: str = "weekly"


class BatchAnalyzeResponse(BaseModel):
    summary: str
    tags: list[str]
    confidence: float
    productIds: list[str]
    sentiment: str


@app.get("/")
async def get_service_status():
    return {"service": "core-interaction-ai-analyzer", "status": "running"}


@app.get("/health")
async def get_health_status():
    return {"status": "healthy", "service": "core-interaction-ai-analyzer"}


@app.post("/analyze/session", response_model=AnalysisResponse)
async def analyze_session(request: AnalysisRequest):
    logger.info(
        f"Starting analysis for session {request.session.sessionId} "
        f"with {len(request.events)} events"
    )

    try:
        crew = SessionAnalysisCrew(
            cf_account_id=request.cfAccountId,
            cf_ai_api_key=request.cfAiApiKey,
            session_data=request.session.model_dump(),
            events=[e.model_dump() for e in request.events],
            ai_gateway_id=request.aiGatewayId,
        )

        result = await crew.analyze()

        logger.info(
            f"Analysis completed for session {request.session.sessionId}: "
            f"{len(result['interactions'])} interactions found"
        )

        return AnalysisResponse(
            success=True,
            interactions=result["interactions"],
            agentsUsed=result["metadata"]["agents_used"],
            tasksCompleted=result["metadata"]["tasks_completed"],
        )

    except Exception as e:
        logger.error(f"Analysis failed for session {request.session.sessionId}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze", response_model=BatchAnalyzeResponse)
async def analyze_interactions(request: BatchAnalyzeRequest):
    config = get_config()
    logger.info(
        f"Starting batch analysis for org {request.organization_id} "
        f"with {len(request.interactions)} interactions"
    )

    try:
        interaction_dicts = [i.model_dump() for i in request.interactions]

        crew = InteractionAnalysisCrew(
            cf_account_id=config.cf_account_id,
            cf_ai_api_key=config.cf_ai_api_key,
            interactions=interaction_dicts,
            organization_id=request.organization_id,
            ai_gateway_id=config.ai_gateway_id,
        )

        result = await crew.analyze()

        logger.info(
            f"Batch analysis completed for org {request.organization_id}: "
            f"confidence={result.get('confidence', 0)}"
        )

        return BatchAnalyzeResponse(
            summary=result.get("summary", ""),
            tags=result.get("tags", []),
            confidence=result.get("confidence", 0.0),
            productIds=result.get("productIds", []),
            sentiment=result.get("sentiment", "neutral"),
        )

    except Exception as e:
        logger.error(f"Batch analysis failed for org {request.organization_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def process_analysis_request(
    analysis_request: AnalysisRequest,
) -> dict[str, Any]:
    try:
        analysis_result = await analyze_session(analysis_request)
        return {
            "sessionId": analysis_request.session.sessionId,
            "result": analysis_result,
        }
    except HTTPException as error:
        return {"sessionId": analysis_request.session.sessionId, "error": error.detail}


@app.post("/analyze/batch")
async def analyze_sessions_batch(
    analysis_requests: list[AnalysisRequest],
) -> dict[str, list[dict[str, Any]]]:
    results = [
        await process_analysis_request(req) for req in analysis_requests
    ]
    return {"results": results}


if __name__ == "__main__":
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8080,
        log_level="info",
        timeout_graceful_shutdown=5,
    )

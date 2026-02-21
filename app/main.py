from fastapi import FastAPI
from pydantic import BaseModel
from .analyzer import analyze_interactions

app = FastAPI()

class AnalyzeRequest(BaseModel):
    organization_id: str
    interactions: list[dict]
    period: str = "weekly"

class AnalyzeResponse(BaseModel):
    summary: str
    insights: list[str]
    anomalies: list[str]
    recommendations: list[str]

@app.get("/health")
def health():
    return {"status": "ok", "service": "crow-interaction-analyzer"}

@app.post("/analyze")
async def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    return await analyze_interactions(
        organization_id=request.organization_id,
        interactions=request.interactions,
        period=request.period,
    )

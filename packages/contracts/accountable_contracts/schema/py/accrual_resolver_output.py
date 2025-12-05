from pydantic import BaseModel, confloat
from typing import Any, List, Optional
from uuid import UUID

class AccrualResolverOutput(BaseModel):
    class TopNRecommendationsItem(BaseModel):
        account_id: UUID
        account_label: str
        score: confloat(ge=0, le=1)
        reasoning: str
        method: str
        metadata: Optional[Any] = None
    class Top1Recommendation(BaseModel):
        account_id: UUID
        account_label: str
        score: confloat(ge=0, le=1)
        reasoning: str
        method: str
        metadata: Optional[Any] = None
    should_accrue: bool
    confidence: confloat(ge=0, le=1)
    top_n_recommendations: List[TopNRecommendationsItem]
    top_1_recommendation: Optional[Top1Recommendation]
    fallback_used: bool
    explanation: str
    latency_ms: float
    metadata: Optional[Any] = None
from datetime import UTC, datetime

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class HealthResponse(BaseModel):
    service: str
    status: str
    timestamp: str


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        service="avatarkit-ai-runtime",
        status="ok",
        timestamp=datetime.now(UTC).isoformat(),
    )

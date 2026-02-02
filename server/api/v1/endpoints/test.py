from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class TestRequest(BaseModel):
    text: str


class TestResponse(BaseModel):
    message: str


@router.post("/test", response_model=TestResponse)
async def test_communication(request: TestRequest):
    return TestResponse(message="api is communicating okay")


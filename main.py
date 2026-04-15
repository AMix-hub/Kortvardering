import base64
import json
import os
from typing import Any, Dict, List, Optional

import requests
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:
    from openai import OpenAI
except Exception:  # pragma: no cover
    OpenAI = None  # type: ignore


POKEMON_TCG_API_URL = "https://api.pokemontcg.io/v2/cards"
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")

app = FastAPI(title="Pokemon Card Valuation Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PriceSummary(BaseModel):
    low: Optional[float] = None
    average: Optional[float] = None
    high: Optional[float] = None
    currency: str = "USD"


class IdentifiedCard(BaseModel):
    name: str
    set: str
    number: str


class ItemBlueprint(BaseModel):
    item_type: str = "pokemon_card"
    schema_version: int = 1
    identity: Dict[str, str]
    traits: Dict[str, Any]


class AnalyzeCardResponse(BaseModel):
    name: str
    set: str
    number: str
    detected_condition: str
    condition_notes: List[str] = Field(default_factory=list)
    official_card_data: Dict[str, Any]
    prices: PriceSummary
    item_blueprint: ItemBlueprint


class VisionAnalysisResult(BaseModel):
    name: str
    set: str
    number: str
    detected_condition: str
    condition_notes: List[str]
    image_quality_ok: bool = True


def _openai_client() -> Any:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured")
    if OpenAI is None:
        raise HTTPException(status_code=500, detail="openai package is not installed")
    return OpenAI(api_key=api_key)


def analyze_card_image_with_vision(image_bytes: bytes, filename: str) -> VisionAnalysisResult:
    mime = "image/jpeg"
    low = filename.lower()
    if low.endswith(".png"):
        mime = "image/png"
    elif low.endswith(".webp"):
        mime = "image/webp"

    image_b64 = base64.b64encode(image_bytes).decode("utf-8")
    client = _openai_client()

    prompt = (
        "You are analyzing a Pokemon trading card image. "
        "Return only valid JSON with keys: name, set, number, detected_condition, condition_notes, image_quality_ok. "
        "Condition should be one of: Mint, Near Mint, Lightly Played, Moderately Played, Heavily Played, Damaged. "
        "condition_notes must include observations about whitening, scratches, and corner wear. "
        "If image is too blurry or unreadable, set image_quality_ok=false and explain in condition_notes."
    )

    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": "You are a precise Pokemon card grading and recognition assistant.",
            },
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime};base64,{image_b64}"},
                    },
                ],
            },
        ],
        temperature=0.1,
    )

    raw = response.choices[0].message.content or "{}"
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:  # pragma: no cover
        raise HTTPException(status_code=502, detail="Vision model returned invalid JSON") from exc

    try:
        return VisionAnalysisResult(**parsed)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Vision response missing required fields: {exc}") from exc


def _tcg_headers() -> Dict[str, str]:
    key = os.getenv("POKEMON_TCG_API_KEY")
    return {"X-Api-Key": key} if key else {}


def fetch_card_from_tcg(identified: IdentifiedCard) -> Dict[str, Any]:
    query = f'name:"{identified.name}" set.name:"{identified.set}" number:"{identified.number}"'
    params = {"q": query, "pageSize": 1}
    response = requests.get(POKEMON_TCG_API_URL, params=params, headers=_tcg_headers(), timeout=20)

    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="Failed to fetch data from Pokémon TCG API")

    cards = response.json().get("data", [])
    if cards:
        return cards[0]

    fallback_params = {"q": f'name:"{identified.name}" number:"{identified.number}"', "pageSize": 1}
    fallback_response = requests.get(
        POKEMON_TCG_API_URL,
        params=fallback_params,
        headers=_tcg_headers(),
        timeout=20,
    )
    if fallback_response.status_code >= 400:
        raise HTTPException(status_code=502, detail="Failed fallback query against Pokémon TCG API")

    fallback_cards = fallback_response.json().get("data", [])
    if not fallback_cards:
        raise HTTPException(status_code=404, detail="Card not found in Pokémon TCG database")
    return fallback_cards[0]


def extract_price_summary(card_data: Dict[str, Any]) -> PriceSummary:
    prices = (card_data.get("tcgplayer") or {}).get("prices") or {}
    best = prices.get("holofoil") or prices.get("reverseHolofoil") or prices.get("normal") or {}

    return PriceSummary(
        low=best.get("low"),
        average=best.get("mid") or best.get("market"),
        high=best.get("high"),
    )


@app.post("/analyze-card", response_model=AnalyzeCardResponse)
async def analyze_card(file: UploadFile = File(...)) -> AnalyzeCardResponse:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    vision = analyze_card_image_with_vision(image_bytes, file.filename or "card.jpg")
    if not vision.image_quality_ok:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "Image quality too low",
                "condition_notes": vision.condition_notes,
            },
        )

    identified = IdentifiedCard(name=vision.name, set=vision.set, number=vision.number)
    card_data = fetch_card_from_tcg(identified)
    prices = extract_price_summary(card_data)

    return AnalyzeCardResponse(
        name=identified.name,
        set=identified.set,
        number=identified.number,
        detected_condition=vision.detected_condition,
        condition_notes=vision.condition_notes,
        official_card_data={
            "id": card_data.get("id"),
            "name": card_data.get("name"),
            "set": card_data.get("set", {}).get("name"),
            "number": card_data.get("number"),
            "rarity": card_data.get("rarity"),
            "image": (card_data.get("images") or {}).get("large")
            or (card_data.get("images") or {}).get("small"),
        },
        prices=prices,
        item_blueprint=ItemBlueprint(
            identity={
                "source": "pokemontcg.io",
                "card_id": card_data.get("id", "unknown"),
                "name": identified.name,
                "set": identified.set,
                "number": identified.number,
            },
            traits={
                "detected_condition": vision.detected_condition,
                "condition_notes": vision.condition_notes,
                "rarity": card_data.get("rarity"),
            },
        ),
    )

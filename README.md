# Kortvardering

Production-ready Pokémon card valuation module.

## Backend (`main.py`)
- FastAPI endpoint: `POST /analyze-card`
- Uses OpenAI GPT-4o Vision to identify card metadata and condition
- Queries `pokemontcg.io` for official card info and market prices
- Handles blurry/unreadable images and card-not-found cases

### Environment variables
- `OPENAI_API_KEY` (required)
- `OPENAI_MODEL` (optional, default: `gpt-4o`)
- `POKEMON_TCG_API_KEY` (optional, recommended for higher rate limits)

Run:
```bash
uvicorn main:app --reload
```

## Frontend (`CardScanner.tsx`)
- React + Tailwind component with drag-and-drop upload
- Shows uploaded image vs. official card data
- Shows condition report and market pricing table

Use `VITE_API_BASE_URL` to point to the backend API.

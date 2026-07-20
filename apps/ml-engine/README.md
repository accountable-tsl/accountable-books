# ML Engine for Accountable Books

Automatically suggests which account to use when categorizing bank transactions.

**Example:** a $500 transaction from "Legal Services Inc" → account "Professional Fees" (85% confidence), plus an accrual suggestion when needed.

## How It Works

1. **Model A (Intent Classifier):** What type of expense/revenue is this?
2. **Model B (Account Ranker):** Which COA account matches best?
3. **Accrual Resolver:** Prepaid vs accrued (when applicable)?

## Current Status: Phase 0 (Baseline)

**Live:** embedding similarity, historical pattern matching, confidence/explanations, accrual recommendations.

**Not yet:** trained ML models, evaluation metrics, multi-account splits.

## Stack

- Python **3.13** (see `pyproject.toml`: `requires-python = ">=3.13,<3.14"`)
- FastAPI, MiniLM embeddings, Redis, sentence-transformers, scikit-learn, pydantic
- Package manager: [uv](https://docs.astral.sh/uv/)

## Local Development

```bash
# From repo root
make ml-only

# Or from apps/ml-engine
uv sync --frozen
pnpm dev   # http://localhost:8000
```

**Tests** (builds contracts first, then pytest):

```bash
pnpm test
# or: uv run pytest
```

API docs: http://localhost:8000/docs

## Project Structure

```
ml_engine/
├── domains/
│   ├── prediction/          # Main prediction pipeline
│   └── accrual/             # Accrual resolver logic
├── models/
│   ├── categorization/      # Model A & Model B
│   └── registry/            # Model versioning
├── core/                    # Embeddings, utilities
└── main.py                  # FastAPI app
```

## Known Limitations

1. Heuristic baselines only (no LightGBM training yet)
2. No evaluation framework / accuracy tracking
3. Single account per transaction (no splits)
4. Accrual resolver assumes small-company materiality
5. Embeddings computed per request (not pre-cached)

Deep design: [TECHNICAL.md](TECHNICAL.md)

# ML Engine for Accountable Books

## What This Does

Automatically suggests which account to use when categorizing bank transactions.

**Example:** You have a $500 transaction from "Legal Services Inc" - the ML engine suggests:

- Account: "Professional Fees"
- Confidence: 85%
- Accrual suggestion: "Accrued Professional Fees" (if needed)

## How It Works (Simple Explanation)

1. **Model A (Intent Classifier):** Figures out what type of expense/revenue this is
   - "Is this professional fees, travel, or utilities?"

2. **Model B (Account Ranker):** Picks the specific account from your chart
   - "Which account in your books matches this best?"

3. **Accrual Resolver:** Suggests if you need an accrual account
   - "Should this be prepaid or accrued?"

## Current Status: Phase 0 (Baseline)

**What's Live:**

- ✅ Text matching using embeddings (AI-powered similarity)
- ✅ Historical pattern learning (remembers past choices)
- ✅ Confidence scores and explanations
- ✅ Accrual recommendations (cash vs accrual basis)

**What's Not Yet:**

- ❌ Machine learning training (using heuristics now)
- ❌ Accuracy metrics (no evaluation yet)
- ❌ Multi-account splits (one account per transaction only)

## Technology Stack

- **Language:** Python 3.12
- **Framework:** FastAPI
- **AI Model:** MiniLM (384-dimension embeddings)
- **Database:** Redis (for caching)
- **Packages:** sentence-transformers, scikit-learn, pydantic

## Local Development

**Start the server:**

```bash
cd apps/ml-engine
uv sync --frozen
uv run uvicorn ml_engine.main:app --reload --port 8001
```

**Run tests:**

```bash
uv run pytest
```

**Check API docs:**

```
http://localhost:8001/docs
```

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

## Known Limitations & TODOs

### High Priority

1. **No ML training yet** - Using heuristic baselines (TF-IDF, cosine similarity)
   - Need to collect labeled training data
   - Plan: Switch to LightGBM after collecting 1000+ labeled transactions

2. **No evaluation framework** - Can't measure accuracy
   - Need test set with ground truth labels
   - Plan: Build evaluation pipeline with precision/recall metrics

3. **Single account only** - Can't split transactions
   - Example: Can't split $1000 into $800 rent + $200 utilities
   - Plan: Add split logic after Phase 1

### Medium Priority

4. **Company size missing** - Accrual resolver assumes all companies are "small"
   - Need `company_size` field in companies table
   - Affects materiality thresholds

5. **Historical patterns incomplete** - Missing frequency and recurring flags
   - `typical_frequency`: Should come from historical patterns
   - `is_recurring`: Should come from transaction signals

6. **No A/B testing** - Can't test model improvements safely
   - Need model version deployment strategy
   - Plan: Use model registry versions for gradual rollout

### Low Priority

7. **String matching could be better** - Currently uses simple token matching
   - Could use `rapidfuzz` for fuzzy matching
   - Or n-grams for better similarity

8. **Embeddings not cached** - Computing on every request
   - Pre-compute account embeddings
   - Store in Redis with COA snapshot

## Performance Notes

- **Typical latency:** 200-500ms per prediction
- **Accrual resolver adds:** ~20-50ms overhead (10-15%)
- **Bottleneck:** Embedding computation (can cache)

## What's Next: Roadmap

**Phase 1: Training** (After collecting data)

- Train Model A on labeled account types
- Use LightGBM classifier
- Add SHAP explanations

**Phase 2: Ranking** (After 30-50 companies)

- Train Model B with LambdaRank
- Learn tenant-specific patterns
- Improve historical matching

**Phase 3: Evaluation** (Ongoing)

- Build test framework
- Track accuracy over time
- Set up monitoring

## Questions?

See [TECHNICAL.md](TECHNICAL.md) for detailed technical design.

# The Autonomous Bookkeeper: ML System Design

## 1. THE GOAL

Build an "Autonomous Bookkeeper." Our objective is to take a raw bank transaction and automatically generate a valid, balanced, double-entry journal entry. The system must not only predict the correct account but also explain why it made that prediction, building trust with our users. Accountants have very low threshold for errors.

## 2. The Core Challenge

Bookkeeping is deterministic math wrapped in probabilistic intent.

- **Deterministic**: Debits must equal Credits. Bank inflows are always debits to the bank; outflows are always credits to the bank.
- **Probabilistic**: Deciding if a payment to "Amazon" is Office Supplies or IT Equipment requires context.

**The Solution**: We are building a hybrid system. We use Machine Learning to predict the Business Intent, and a Rule-Based bookkeeping constraints solver to enforce the Accounting Mechanics. The ML engine does not have to handle the solver, Node.js will handle it.

## 3. Critical V1 Constraints

By design, our ML models will be trained only on `trainable: true` + `label_role: "semantic"` account types. This decision has the following consequences:

- `ca_bank` is marked trainable false, so we can't predict transfers between accounts yet. Maybe we wire up some rules to handle that for now
- `ap`, `ar` are also not trainable, so Model A will not be able to match payments to AP or AR etc (see FAQ #8)
- No split predictions for now, we assume 100% allocation to the primary predicted category (see FAQ #7)
- We'll use the account type's default side to determine if an entry is debit or credit

These constraints explain why AP/AR isn't predicted, why we don't handle transfers, why splits aren't predicted, why bank legs aren't predicted, and why `trainable = false` matters.

## 4. Architecture Overview

We use a two-stage pipeline:
Model A = LightGBM classifier (global intent)
Model B = retrieval + ranking (tenant-specific)

### 4.1 Implementation Phases

**Note**: This document describes our **target architecture**. We're implementing in phases:

**Current (Phase 0)**: Heuristic baselines

- **Model A**: TF-IDF + cosine similarity (see `global_intent_classifier.py`)
- **Model B**: Heuristic ranker (history + embeddings)
- Why: Ship product first, collect data, train models later

**Phase 1**: Train Model A

- After collecting training data from product usage
- Replace TF-IDF with LightGBM
- Same API contract, better accuracy
- **Training data guidelines**:
  - ❌ Do NOT use rule-based overrides as training labels (they're deterministic, not learned patterns)
  - ❌ Do NOT enable feedback-loop training until we have stable semantics (avoid training on incorrect corrections)

**Phase 2**: Train Model B

- After 30-50 companies using product consistently
- Replace heuristics with LightGBM LambdaRank
- Needs per-company historical data to be effective

## 5. Implementation Components

### Phase 1: Data Preparation and Filtering

- **Input**: EnrichedTransaction + List of Account Types
- **Filter**: Filter the training targets using `trainable: true` + `label_role: "semantic"`

### Phase 2: Feature Engineering

**Simple Principle**: We give LightGBM numeric, boolean, and encoded categorical features. Everything else becomes text embeddings.

LightGBM handles tabular data well but cannot read text. We need to build a feature pipeline that flattens JSON and converts to vector.

A single enriched transaction is flattened into the following feature groups:

#### A. Text Embedding (384-dim from MiniLM)

**Why MiniLM (all-MiniLM-L6-v2)?** It's been pretrained, is very small, and is fast. We need embeddings to convert text data into vectors (numbers) that LightGBM can work with, and MiniLM gives us good semantic understanding without the overhead of larger models.

**One combined embedding** created by concatenating these fields into a single string:

| Field                                      | Notes                              |
| ------------------------------------------ | ---------------------------------- |
| `normalized.description`                   | Primary transaction description    |
| `normalized.contact_name`                  | Contact name from transaction      |
| `raw.reference`                            | Transaction reference              |
| `normalized.global_contact_name`           | Global contact identifier          |
| `normalized.global_contact_category_hints` | Category hints (joined)            |
| `signals.notes[]`                          | Optional - flattened into sentence |
| `context.industry`                         | Optional - industry context        |

**Processing**: All fields concatenated → single string → 384-dim embedding via MiniLM

**Note**: `normalized.description_tokens` is ignored; the description itself is sufficient.

#### B. Numeric Features

| Field                                    | Source        | Notes              |
| ---------------------------------------- | ------------- | ------------------ |
| `raw.amount`                             | Transaction   | Transaction amount |
| `rolling_stats.totals.amount_native_sum` | Rolling stats | Sum of amounts     |
| `rolling_stats.avg_amount_native`        | Rolling stats | Average amount     |
| `rolling_stats.stddev_amount_native`     | Rolling stats | Standard deviation |

**Note**: 30d/90d rolling stats are dropped for now; can be added later if needed.

#### C. Temporal Features

| Field              | Type    | Range |
| ------------------ | ------- | ----- |
| `day_of_week`      | Integer | 0-6   |
| `calendar_month`   | Integer | 1-12  |
| `calendar_quarter` | Integer | 1-4   |
| `fiscal_month`     | Integer | 1-12  |
| `fiscal_quarter`   | Integer | 1-4   |

#### D. Categorical Features (Integer-encoded)

| Field                                 | Encoding                          |
| ------------------------------------- | --------------------------------- |
| `raw.currency_code`                   | Integer or one-hot                |
| `context.country_code`                | Integer or one-hot                |
| `context.reporting_currency_code`     | Integer or one-hot                |
| `normalized.contact_match_confidence` | 0=unmatched, 1=low, 2=med, 3=high |
| `normalized.contact_type`             | Integer or one-hot                |

#### E. Binary Flags

| Field                             | Type          |
| --------------------------------- | ------------- |
| `signals.likely_trf_btw_accounts` | Boolean (0/1) |
| `signals.likely_split`            | Boolean (0/1) |
| `signals.requires_vat_check`      | Boolean (0/1) |
| `signals.requires_fx_review`      | Boolean (0/1) |

#### Fields Excluded from Input

The following fields are **not** included in Model A input:

- All IDs and UUIDs (transaction IDs, company IDs, etc.)
- `normalized.normalized_reference` (only `raw.reference` is used)
- `context.company_name` (not included in final input)
- `day_of_month` (only `day_of_week` is used)
- 30d/90d rolling stats (only totals are used)

#### Feature Mapping Versioning

Keep a folder that stores feature mapping versions as simple JSON files.

**Naming Convention**: Feature maps use semantic versioning with model prefix:

- Format: `fmap_{model}_{major}.{minor}` (e.g., `fmap_a_1.0`, `fmap_b_1.0`)
- Model prefix: `a` for global intent classifier, `b` for tenant account ranker
- Major version: Increment for breaking changes (removed/changed features)
- Minor version: Increment for additions (new features, backward compatible)

```json
{
  "version": "fmap_a_1.0",
  "features": [
    "emb_description",
    "flag_recurrence",
    "kw_software",
    "amount_native",
    "day_of_week",
    "calendar_month",
    "currency_code"
  ]
}
```

This allows us to track exactly which features were used for each prediction (see FAQ #12).

### Phase 3: Model A (The Global Accountant)

- **Objective**: Predict the high-level account_type_key (business intent)
- **Scope**: Global (trained on data from all companies)
- **Model**: LightGBM Classifier (Multi-class)
- **Input**: Semantic Features + Context Features (as detailed in Phase 2)
- **Output**: Top-5 predicted Class Keys with probability scores
- **Explainability**: Use TreeSHAP to generate global explanations

#### Model A Output Format

```json
{
  "model_name": "global_intent_lightgbm",
  "model_version": "v260101-01-1.0.0",
  "latency_ms": 32,

  "semantic_top1": "exp_opex_software_subscriptions",
  "semantic_top1_prob": 0.88,

  "semantic_top_k": [
    {
      "key": "exp_opex_software_subscriptions",
      "prob": 0.88,
      "label_role": "semantic"
    },
    {
      "key": "exp_opex_professional_fees",
      "prob": 0.08,
      "label_role": "semantic"
    },
    {
      "key": "exp_opex_office_supplies",
      "prob": 0.04,
      "label_role": "semantic"
    },
    { "key": "exp_opex_other", "prob": 0.0, "label_role": "fallback" },
    { "key": "ca_prepayment", "prob": 0.0, "label_role": "semantic" }
  ],

  "shap_values": {
    "emb_description": 0.65,
    "flag_recurrence": 0.2,
    "kw_software": 0.15,
    "amount_native": -0.1
  },

  "feature_mapping_version": "fmap_a_1.0"
}
```

**Note on SHAP values**: SHAP values are per-feature contributions to the prediction. For embeddings, SHAP is applied on PCA-reduced features (not raw 384 dims). The example uses simplified feature names for readability. LightGBM does not apply SHAP directly to the raw 384-dim embedding.

**Note**: Model A returns only one leg (the non-bank leg). We already know the bank leg, and returning both would add training noise. See FAQ #7 for why we don't predict splits.

### Phase 4: Model B (The Company Bookkeeper)

- **Objective**: Rank the specific COA Nodes (e.g., 6004-Travel) belonging to the types predicted by Model A
- **Scope**: Tenant-Specific (Ranking happens within the context of one company's Chart of Accounts)
- **Model**: Model B is NOT ML at first. It is a retrieval + scoring + fallback system. Later, when we have more data, we swap the scoring function for LightGBM LambdaRank (see FAQ #3)
- **Input**:
  - Model A results (`semantic_top1`, `semantic_top_k`)
  - The enriched transaction (same input Model A got)
  - Company's COA snapshot
- **Output**: Sorted COA IDs and probability for each of the lines predicted
- **Explainability**: SHAP values

**Note**: We need to find a way to retrieve company's COA. Check TypeScript API if it has helped in any way.

#### Model B Process

**Step 1 — Candidate Generation**

- Pull all COA accounts matching Model A's semantic type
- Add overrides: any accounts the company has used historically for this vendor (Tier 1)
- If none found → use fallback account for that semantic type

**Step 2 — Filtering**

- If basis = "cash", remove AP/AR/control accounts (unless history used them before)
- Remove mechanical/contra accounts
- Remove non-postable accounts

**Step 3 — Scoring & Ranking**

Model B assigns a score to each candidate using three signals:

1. **History Score (highest priority)**
   - If this vendor historically maps to a specific account: Score = 100 + frequency
   - Explanation = "Used previously for this vendor."

2. **Semantic/Embedding Score**
   - If no history: Compute cosine similarity between transaction embedding and account label/description embedding
   - Score = similarity
   - Explanation = "Strong text match in chart of accounts."

3. **Model A Confidence (tie-breaker)**
   - If still tied: Use Model A probability
   - Explanation = "Backed by classifier confidence."

#### Model B Output Format

```json
{
  "model_name": "tenant_account_ranker",
  "model_version": "v260101-01-1.0.0",
  "latency_ms": 14,

  "selected_account_id": "57b361b5-4a6e-4f28-ad1f-be9bf615066b",
  "selected_account_label": "IT Software, Subscriptions and Consumables",
  "selected_account_score": 0.92,

  "ranking_top_k": [
    {
      "account_id": "57b361b5-4a6e-4f28-ad1f-be9bf615066b",
      "account_label": "IT Software, Subscriptions and Consumables",
      "score": 0.92,
      "reason": "history"
    },
    {
      "account_id": "27d0095c-b6d9-436e-889e-28a336a60227",
      "account_label": "Professional Fees",
      "score": 0.63,
      "reason": "embedding_match"
    },
    {
      "account_id": "ea13393e-62f4-4a6b-8bcc-2a08b6d76974",
      "account_label": "Office Supplies & Stationery",
      "score": 0.41,
      "reason": "semantic_intent"
    }
  ],

  "explanation": {
    "reason": "history",
    "message": "This vendor has been posted to this account 12 times in the past."
  },

  "shap_values": {
    "vendor_match_strength": 0.55,
    "account_name_similarity": 0.31,
    "semantic_intent_prob": 0.06
  },

  "feature_mapping_version": "fmap_b_1.0"
}
```

**Reason values**: `"history"` | `"embedding_match"` | `"semantic_intent"`

#### Final Posting Structure

The complete prediction result sent to Node.js:

```json
{
  "final_posting": {
    "account_id": "57b361b5-4a6e-4f28-ad1f-be9bf615066b",
    "account_label": "IT Software, Subscriptions and Consumables"
  },

  "model_a": {
    "model_name": "global_intent_lightgbm",
    "model_version": "v260101-01-1.0.0",
    "semantic_top1": "exp_opex_software_subscriptions",
    "semantic_top1_prob": 0.88,
    "semantic_top_k": [...],
    "shap_values": {...},
    "feature_mapping_version": "fmap_a_1.0"
  },

  "model_b": {
    "model_name": "tenant_account_ranker",
    "model_version": "v260101-01-1.0.0",
    "selected_account_id": "57b361b5-4a6e-4f28-ad1f-be9bf615066b",
    "selected_account_score": 0.92,
    "ranking_top_k": [...],
    "explanation": {...},
    "shap_values": {...},
    "feature_mapping_version": "fmap_b_1.0"
  }
}
```

**Important**: Model B picks the account. The solver builds the actual journal entry (debit/credit/AP/AR/tax entries). ML never touches accounting mechanics.

Node.js then runs the constraint solver that converts semantic intent + ranked account + company rules into a correct, balanced journal entry that respects accounting basis and bookkeeping mechanics.

#### Label-Role Policy

| role       | trainable | candidate | notes                              |
| ---------- | --------- | --------- | ---------------------------------- |
| semantic   | yes       | yes       | bank-text-resolvable categories    |
| mechanical | no        | no        | posted by schedules/close          |
| control    | no        | yes       | bank/AP/AR/tax control legs        |
| fallback   | no        | yes       | last-resort posting; never a label |

### Phase 5: The Assembler

- Simple debit, credit and bank leg check
- Construct the ML prediction result object and return results
- Add metadata etc

## 6. Other Notes

- Most companies have small COA size, we seldom have a company with 1000 lines
- Some companies have nested COAs, we don't support nested COAs for now but users might try to achieve same kind of hierarchy using account codes and naming conventions
- Sometimes, a company might not have chart of account for the account type we select... this is something we need to keep our eyes out for. Might be avenue to recommend accounts to create for the company in the future (see FAQ #11)
- Evaluation is important but not blind ones. We'll start with basic ones, get data and check outcomes and manually improve evals over time

---

# FAQ: How Our Accounting ML System Works

A simple, clear explanation of why the system is designed the way it is.

---

## 1. Why do we use two models?

Because the problem has two parts:

- Model 1 understands the meaning of a transaction.
- Model 2 picks the exact account in that company's chart of accounts.

One model cannot do both well.

---

## 2. Why LightGBM for intent?

It is fast, cheap, stable, and works great on mixed data (text + numbers).  
It gives explainable results.  
Deep learning gives no real benefit here.

---

## 3. Why not LightGBM for ranking?

Ranking needs per-tenant behavior.  
Most tenants have little or zero data.  
LightGBM can't rank well with almost no history.

That's why Model B starts as a simple heuristic ranker using embeddings and similarity scoring. Once we have enough historical data, we can move to LightGBM LambdaRank.

---

## 4. Why does a ranker use embeddings + history?

Text similarity helps guess meaning.  
History captures what this specific business usually does.  
These two signals cover almost every situation.

---

## 5. Why doesn't ML build the journal entry?

Posting rules are strict accounting logic (debits, credits, basis rules, tax rules).  
These cannot be guessed safely.  
ML gives meaning; the solver builds the entry.

---

## 6. Why do rules run before ML?

Rules give 100% correct answers when they match.  
ML only steps in when rules don't apply.  
This avoids mistakes and confusion.

---

## 7. Why doesn't ML predict splits?

Splits follow strict math and tax rules.  
They are not "predictions."  
The solver handles all of it.

Model A returns only one leg (the non-bank leg) because:

- We already know the bank leg
- Predicting splits would require a Regressor or deep learning model, which is too heavy for now
- Most transactions are single legs anyway
- The model might waste confidence saying "I'm sure this is a bank leg"

---

## 8. Why doesn't the intent model learn AP/AR?

AP/AR is structure, not meaning.  
Intent identifies what the spend _is_.  
The solver decides whether it becomes AP/AR.

---

## 9. Why does the solver handle cash vs accrual?

Accounting basis changes the posting flow, not the transaction meaning.  
ML finds meaning.  
The solver applies basis rules.

---

## 10. Why does vendor history get top priority?

Vendors are the strongest real-world clue.  
People use the same account for the same vendor repeatedly.  
History beats any model score.

---

## 11. What if the COA is missing an account?

We fall back to a safe "other" account.  
The system always returns something usable.

---

## 12. Why version the features?

To know exactly how a prediction was made.  
If anything changes, we bump the version.  
This keeps results reproducible.

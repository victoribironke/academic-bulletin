---
title: GRACE Vision AI
emoji: 🎓
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
license: other
---

# GRACE Vision AI

This application evaluates course descriptions for alignment with Babcock University's **GRACE** vision:
- **G**lobal Relevance
- **R**esearch Focus
- **A**dventist Rooted
- **C**ompetent Community
- **E**ntrepreneurship

## Architecture: 3-Tier AI Fallback

| Priority | Provider | Model | Type |
|----------|----------|-------|------|
| **Tier 1** | Google AI Studio | `gemini-2.5-flash` | Cloud (fastest) |
| **Tier 2** | Together AI | `meta-llama/Meta-Llama-3-8B-Instruct-Lite` | Cloud (fallback) |
| **Tier 3** | Hugging Face | `google/gemma-4-e4b-it` | Local (last resort, ~8GB RAM) |

If Tier 1 fails (quota/outage), the system automatically falls through to Tier 2, then Tier 3.

## Environment Variables

Set these in your Space settings (**Repository → Settings → Secrets**):

| Variable | Required? | Purpose |
|----------|-----------|---------|
| `GOOGLE_API_KEY` | Recommended | Google AI Studio API key for Gemini 2.5 Flash |
| `TOGETHER_API_KEY` | Optional | Together AI API key for Llama 3 fallback |
| `HF_TOKEN` | Optional | Hugging Face token for gated Gemma 4 model access |

> **Note**: At least one of these must be set for the app to function.

## API Usage

### Health Check
```
GET /
```

### Evaluate a Course
```
POST /check-grace
Content-Type: application/json

{
  "title": "Introduction to Data Science",
  "content": "This course covers statistical methods, machine learning fundamentals..."
}
```

Response includes `analysis` (JSON scores) and `model_used` (which tier handled it).

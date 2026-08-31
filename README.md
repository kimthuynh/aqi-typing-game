# AQI Typing Adventure

Browser-based typing game built on real EPA AQI data. Players type narrated
scenes about their state's air quality trends, generated once per state via
Claude Haiku 4.5 and cached in S3. Vanilla JS frontend, Vercel serverless
backend.

## Stack

- **Frontend:** Vanilla HTML/CSS/JS. D3.js + TopoJSON via CDN. JetBrains Mono / Inter via Google Fonts. No build step.
- **Backend:** Vercel serverless functions (Node 20). Deps: `@anthropic-ai/sdk`, `@aws-sdk/client-s3`, `papaparse`.
- **Storage:** S3 — `generated-text/{state}.json` for per-state story cache, `scores/{username}.json` for player scores (30-day lifecycle).
- **Model:** `claude-haiku-4-5-20251001`.

## Local development

```bash
npm install
npm i -g vercel      # first time only
vercel dev           # http://localhost:3000
```

With `MOCK_MODE=true`, `/api/get-story` returns the New York reference text
(with the state name swapped in) — lets you test the full frontend/typing loop
without spending API credits or writing to S3.

## Deploy (Vercel + GitHub)

1. Push to GitHub.
2. `vercel link`, then set all env vars from `.env.local` in the Vercel
   dashboard (Production + Preview).
3. Deploy. Verify both a cold-state path (never-seen state → Claude call → S3
   write) and a warm-state path (cached state, no Claude call).

## S3 lifecycle (30-day score expiry)

Run once per bucket:

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket "$S3_BUCKET_NAME" \
  --lifecycle-configuration file://infra/scores-lifecycle.json
```

## Data source

US Environmental Protection Agency. Air Quality System Data Mart [internet
database] available via https://www.epa.gov/outdoor-air-quality-data.
Accessed May 09, 2026. Pollutants: PM2.5 (param 88101), Ozone 8-hr max
(param 44201). 2025 data may be preliminary.

## Missing assets (to be provided)

- Real `scene4.png` (currently identical to `scene3.png`).


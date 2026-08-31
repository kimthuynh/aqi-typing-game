# AQI Typing Adventure — Resources

## User workflow (Tab 1)

- Player lands on **Tab 1** with a full-viewport sky scene and a state dropdown.
- Player picks a state (or clicks **Surprise me** — picks from cached states first, otherwise any of 50).
- Player clicks **Start** → frontend calls `/api/get-story?state={state}`.
- **Scene 1** shows Skye's static intro. No API call, no typing.
- **Scenes 2 / 3 / 4** show generated narration in a typing panel:
  - Live **WPM**, **Accuracy**, **Time** in the top-right HUD.
  - "Skye's current location" pill above the HUD.
  - Pause button (or `Esc`) → freezes timer, opens overlay with **Resume** or **See my score now**.
  - Next-scene button unlocks at 100% typed with ≥90% accuracy.
- **Scene 5** shows per-scene breakdown, total WPM/accuracy/time, star rating, save-score input, download JSON/CSV, play again.

## Other tabs

- **Tab 2 — Scores:** search-and-table view of saved scores, sortable columns, expires 30 days after save.
- **Tab 3 — Map:** D3 + TopoJSON US choropleth; cached states colored sky-blue, others grey.
- **Tab 4 — About:** project objective, how-to-use, EPA data-source citation.

## Scoring method

- **Per-keystroke:** correct chars increment `correctChars`, incorrect increment `incorrectChars`. Backspace decrements the appropriate counter.
- **WPM:** `(correctChars / 5) / (elapsedSec / 60)`, updated on every keystroke via `requestAnimationFrame`.
- **Accuracy:** `correctChars / (correctChars + incorrectChars) × 100`.
- **Timer:** starts on first keystroke, freezes on pause, resumes on unpause (tracks accumulated ms across pauses).
- **Per-scene score (0–100):** `0.6 × accuracy + 0.4 × min(100, WPM)`. Accuracy weighted higher than raw speed on purpose.
- **Total score (Scene 5):** simple mean of per-scene scores across scenes actually attempted (`durationSec > 0`).
- **Total WPM:** aggregate across attempted scenes — `(sum correct chars / 5) / (sum durations / 60)` (shown alongside the composite for reference).
- **Total accuracy:** simple mean of per-scene accuracy across attempted scenes.
- **Stars (1–5)** — from the total composite score: `<55 → 1`, `55–64 → 2`, `65–74 → 3`, `75–84 → 4`, `≥85 → 5`. 0 stars if user quit before typing anything.
- **Partial completion:** every typing scene has a "Submit score now" ghost button (always enabled) plus the gated next-scene / Finish button. Whichever the user clicks, the current scene's stats are captured from whatever's been typed; unreached scenes show `—` and are excluded from all averages.

## Agent workflow (`/api/get-story`)

- Frontend request: `GET /api/get-story?state={state}`.
- Handler normalizes state name → slug (e.g. `New York` → `new-york`).
- **Cache check:** `HeadObject` on `s3://{bucket}/generated-text/{slug}.json`.
  - Hit → `GetObject` and return.
  - Miss → continue.
- **Data prep:** fetch `Monthly_aqi_by_state.csv` from the companion GitHub repo (in-memory cached 1h), filter out non-state rows (`Country Of Mexico`, `Puerto Rico`, `Virgin Islands`, `District Of Columbia`), compute `derivedData`:
  - `yearly` — mean PM2.5 / ozone AQI for 2023, 2024, 2025.
  - `yoy` — % change 2023→2024 and 2024→2025 for PM2.5 and ozone.
  - `bestMonth` / `worstMonth` — month with lowest / highest mean combined PM2.5+ozone across all 3 years.
  - `stateRank2025`, `unhealthyDays2025`, `bestState`, `worstState`, `neighborState` — from summed `Unhealthy_days + Very_unhealthy_days` in 2025.
- **Claude call (single request, all 3 scenes):**
  - Model: `claude-haiku-4-5-20251001`.
  - System prompt: Skye persona rules (first person, 5–7 sentences, digits not words, no analytics jargon).
  - User prompt: pre-computed `derivedData` values (Claude never sees raw CSV — avoids arithmetic errors).
  - Response: JSON `{ scene2, scene3, scene4 }`. One retry on parse failure or 5xx. On second failure → hardcoded generic fallback.
- **Persist:** `PutObject` full payload to S3 at `generated-text/{slug}.json`:
  ```
  { state, generatedAt, model, derivedData, scenes }
  ```
- Return to frontend.
- **Subsequent players of the same state** skip the CSV parse and Claude call entirely — served from S3 cache in <100ms.

## Score persistence (`/api/save-score`, `/api/get-scores`, `/api/check-username`)

- Score object stored at `s3://{bucket}/scores/{username}.json`.
- Contains: `username`, `state`, `totals` (wpm, accuracy, durationSec, stars), per-scene `scenes`, `savedAt`, `expiresAt` (+30d).
- Username collisions → 409 with `suggestion` = `{username}{random 3-digit}`.
- Expiry enforced by S3 lifecycle rule on `scores/` prefix (config in `infra/scores-lifecycle.json`); reads also filter `expiresAt > now` as defense in depth.

## Environment variables

- `ANTHROPIC_API_KEY` — Claude API key.
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` — S3 credentials.
- `S3_BUCKET_NAME` — target bucket.
- `AQI_CSV_URL` — companion project's raw CSV URL.
- `MOCK_MODE` — `true` returns NY reference scenes without Claude/S3 calls (dev/testing); `false` hits real services.

## Local dev

- `npm install`
- `npm run dev:local` (or `vercel dev`) → http://localhost:3000.

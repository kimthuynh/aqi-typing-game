# AQI Typing Adventure with Skye the Pigeon

*This document is written to be handed directly to Claude (Claude Code)
as the build instructions for this project.*

---

## Objective

Build a browser-based typing game that teaches players about their
state's air quality (2023–2025) through a five-scene story narrated by
Skye, a fixed pigeon character. Typing text for Scenes 2–4 is generated
once per state via the Claude API (model: `claude-haiku-4-5-20251001`),
cached in S3, and reused for every future player of that state.

This is a companion app to an existing dashboard project (["Air Quality Dashboard"](https://github.com/kimthuynh/air_quality_analysis/tree/main/app/data)), which
publishes `Monthly_aqi_by_state.csv` in its app/data folder. AQI Typing app
fetches that CSV live rather than bundling a static copy, so upstream
data refreshes propagate automatically without a redeploy.

---

## Tool stack

| Layer | Tool |
|---|---|
| Frontend | **Vanilla HTML/CSS/JavaScript** — no React, no build step, no framework |
| Data parsing | Papa Parse (CSV) |
| Choropleth map (Tab 3 + Scene 4) | D3.js + TopoJSON (US states) |
| Text generation | Claude API, model `claude-haiku-4-5-20251001` |
| Cached generated text storage | AWS S3 (one JSON object per state) |
| Serverless backend | Vercel serverless functions (Node.js, `/api/*.js`) |
| Hosting | Vercel, deployed from GitHub |
| Local dev | `vercel dev` (runs frontend + serverless functions together) |
| Fonts | Monospace font for typing area (e.g. `JetBrains Mono` via Google Fonts) |
| Images | 4 pre-generated scene background images (already prepared, see `/images`) |

No database. No React. No build tooling required for the frontend.

---

## Data source

`Monthly_aqi_by_state.csv`, fetched live from App1's public GitHub repo
via `raw.githubusercontent.com/{user}/{repo}/{branch}/{path}`.

Columns: `Year-month`, `Year`, `Month`, `State_name`, `pm25_avg_aqi`,
`pm10_avg_aqi`, `ozone_avg_aqi`, `Unhealthy_days`, `Very_unhealthy_days`.

Notes to build around:
- `pm10_avg_aqi` is ~48% null — do not use it for any scene logic.
- Filter out non-US-state rows before using this data anywhere in the
  app (state picker, random pick, choropleth, Claude prompts):
  `Country Of Mexico`, `Puerto Rico`, `Virgin Islands`,
  `District Of Columbia`.
- Cache the fetched CSV in the serverless function for ~1 hour
  (in-memory or via Vercel's edge cache) to avoid re-fetching on every
  request while still picking up upstream updates without a redeploy.

---

## Workflow

1. Player lands on Tab 1 (landing page), reads Scene 1 (Skye's static
   intro — no generation needed here), enters a state name or clicks
   "random."
2. If "random," the frontend first asks the backend for the list of
   already-generated states (via `/api/generated-states`) and picks
   randomly from that list if it's non-empty; otherwise picks randomly
   from all 50 states.
3. Frontend calls `/api/get-story?state={state}`.
4. Serverless function:
   - Normalizes the state name (case, whitespace) to build a
     consistent S3 key, e.g. `generated-text/new-york.json`.
   - Checks S3 for that key.
     - **Exists** → return the cached JSON as-is.
     - **Missing** → fetch the CSV (or use in-memory cache), compute
       the derived values for that state (see "Data prep" below), build
       the 3 scene prompts, call Claude API once per scene (or one
       combined call returning JSON — see prompt templates), write the
       result + derived values to S3, return it.
5. Frontend renders Scenes 2–4 as typing challenges using the returned
   text, tracking WPM/accuracy per scene client-side only.
6. Scene 5 shows final score, star rating (by speed), option to save a
   username (session-only for v1) and download the score as
   JSON/CSV.
7. Tab 3 calls `/api/generated-states`, which runs S3 `ListObjectsV2`
   on the `generated-text/` prefix and returns the list of states that
   have cached text — colored on the choropleth; everything else grey.

---

## Data prep per state (computed server-side, never left to Claude)

All arithmetic happens in the serverless function before any prompt is
built. Claude should only ever receive pre-computed numbers, never raw
CSV rows — this keeps output grounded and avoids the model doing its
own (unreliable) math.

```js
// Pseudocode — implement in /api/get-story.js
const yearly = groupByYear(stateRows, ['pm25_avg_aqi', 'ozone_avg_aqi']); // mean per year, 2023/2024/2025
const yoy = {
  pm25_23to24: pctChange(yearly[2023].pm25, yearly[2024].pm25),
  pm25_24to25: pctChange(yearly[2024].pm25, yearly[2025].pm25),
  ozone_23to24: pctChange(yearly[2023].ozone, yearly[2024].ozone),
  ozone_24to25: pctChange(yearly[2024].ozone, yearly[2025].ozone),
};

const monthly = groupByMonth(stateRows, ['pm25_avg_aqi', 'ozone_avg_aqi']); // mean per month across all 3 years, combined for best/worst
const bestMonth = monthWithLowestCombined(monthly);
const worstMonth = monthWithHighestCombined(monthly);

const days2025 = sumUnhealthyDaysByState(allRows, 2025); // { state: totalDays }, all 50 states
const ranked = Object.entries(days2025).sort((a, b) => a[1] - b[1]); // ascending, 1 = fewest/best
const stateRank = ranked.findIndex(([name]) => name === state) + 1;
const bestState = ranked[0];
const worstState = ranked[ranked.length - 1];
const neighborBetter = ranked[stateRank - 2]; // one rank better, if exists
```

Store these derived values alongside the generated text in the same S3
object, so the numbers behind any generated story are auditable later.

---

## S3 object schema

```json
{
  "state": "New York",
  "generatedAt": "2026-08-30T00:00:00Z",
  "model": "claude-haiku-4-5-20251001",
  "derivedData": {
    "yearly": { "2023": { "pm25": 46.08, "ozone": 36.68 }, "2024": {...}, "2025": {...} },
    "yoy": { "pm25_23to24": -13.5, "pm25_24to25": 2.0, "ozone_23to24": -0.5, "ozone_24to25": 9.0 },
    "bestMonth": "November",
    "worstMonth": "June",
    "stateRank2025": 46,
    "totalStates": 50,
    "unhealthyDays2025": 30,
    "bestState": { "name": "Hawaii", "days": 0 },
    "worstState": { "name": "California", "days": 154 },
    "neighborState": { "name": "Nevada", "days": 29 }
  },
  "scenes": {
    "scene2": "...",
    "scene3": "...",
    "scene4": "..."
  }
}
```

---

## Claude API call spec

- **Model**: `claude-haiku-4-5-20251001`
- **One API call per state**, requesting all 3 scenes back in a single
  structured JSON response (cheaper and faster than 3 separate calls,
  and guarantees consistent voice across scenes in one generation pass).
- Instruct Claude to return **only valid JSON**, no preamble, no
  markdown code fences — parse directly.
- Numbers should be written as **digits and symbols** in the output
  (`10%`, `#46`, `154`, `3x`), not spelled out — this matches the
  approved sample text style and keeps typing text visually consistent
  with real data.

### System prompt (shared across all 3 scenes)

```
You are writing narration for Skye, a small, friendly, curious pigeon
who guides players through a US air-quality typing game aimed at kids,
parents, and teachers. Skye speaks in first person, present tense,
directly to the player ("you"). Skye is warm, a little playful, and
treats air quality data like something worth being curious about — not
a report to recite.

Rules:
- No analytics or report language. Never say "AQI category threshold,"
  "data indicates," or similar phrasing.
- Use digits and symbols for numbers, not spelled-out words: write
  "13.5%" not "thirteen point five percent," "#46" not "forty-sixth,"
  "3x" not "three times."
- Use numbers sparingly — only where they help the story land, not
  every value provided.
- Each scene must be 5-7 sentences.
- End each scene on one clear, concrete, memorable takeaway — never a
  summary that just restates the numbers.
- Do not invent data. Only use the numbers provided below.
- Return ONLY valid JSON matching the exact schema requested. No
  markdown fences, no preamble, no explanation text.
```

### User prompt template (fill placeholders per state)

```
State: {state}

Data for Scene 2 (trend overview, 2023-2025):
- PM2.5 average AQI: 2023 = {pm25_2023}, 2024 = {pm25_2024}, 2025 = {pm25_2025}
- Ozone average AQI: 2023 = {ozone_2023}, 2024 = {ozone_2024}, 2025 = {ozone_2025}
- PM2.5 YoY change: 2023->2024 = {pm25_yoy_1}%, 2024->2025 = {pm25_yoy_2}%
- Ozone YoY change: 2023->2024 = {ozone_yoy_1}%, 2024->2025 = {ozone_yoy_2}%

Data for Scene 3 (best/worst month):
- Best month for air quality: {best_month}
- Worst month for air quality: {worst_month}
(If a plausible seasonal driver is well known — e.g. summer heat raising
ozone, winter inversion trapping PM2.5, regional wildfire season — you
may mention it briefly and with appropriate hedging. Do not state a
cause as fact if you're not confident it applies.)

Data for Scene 4 (state comparison, 2025):
- {state} unhealthy days: {state_unhealthy_days}, ranked #{state_rank} of {total_states} (1 = fewest unhealthy days = best)
- Best state nationally: {best_state_name}, {best_state_days} unhealthy days
- Worst state nationally: {worst_state_name}, {worst_state_days} unhealthy days
- State ranked just better than {state}: {neighbor_state_name}, {neighbor_state_days} unhealthy days

Write Scene 2, Scene 3, and Scene 4 following the system rules. Return
this exact JSON shape and nothing else:

{
  "scene2": "...",
  "scene3": "...",
  "scene4": "..."
}
```

### Reference example output (New York, digits/symbols style — use this
to sanity-check Claude's output style during testing)

```json
{
  "scene2": "Three years of flying over New York, and I've watched the air do something interesting. Back in 2023, PM2.5 was thick enough that I noticed it on my daily loops. Then 2024 gave us a real break — down 13.5% from the year before. I got used to crisper mornings. But in 2025, that improvement slipped, PM2.5 ticked up +2%, and ozone jumped +9% from last year. So it's not a straight line up or down — more like 2 steps forward, then half a step back. Worth knowing if you plan outdoor time around clear skies.",
  "scene3": "If you want my flying calendar for New York: June is the month I stay closer to the treeline. Across the last 3 summers, June has consistently been the roughest stretch for both PM2.5 and ozone — some years worse than others when wildfire smoke drifts in from the north. November's the opposite: crisp, cool, and about as clear as the sky gets here all year. So if you're planning something outdoors that matters — a big hike, a day at the park — November's your best bet, and June's the month to check the air first.",
  "scene4": "Here's the honest picture: in 2025, New York had 30 days where the air wasn't great — out of 50 states, that's #46, closer to the rough end than the clear end. Nevada, right next door in the rankings, had just 29 — 1 day fewer than you. Compare that to Hawaii: 0 unhealthy days all year. And then there's California, with 154 — 5x what New York saw. So New York isn't the best story in the country, but it's nowhere near the worst either. You're in the middle of the pack, with real room to climb."
}
```

---

## Serverless function skeleton (build this first)

`/api/get-story.js`:
1. Read `state` query param, normalize it.
2. Check S3 for existing cached object → return if found.
3. If not found, fetch/parse CSV (cached in-memory ~1hr), compute
   `derivedData` for the state.
4. Build the user prompt from the template above with real values.
5. Call Claude API (`claude-haiku-4-5-20251001`), parse JSON response.
6. Handle parse failure or API error: retry once, then fall back to a
   generic pre-written fallback story (write 1 fallback set of scene
   2-4 text now, not state-specific, so users never see a broken
   scene).
7. Write `{ state, generatedAt, model, derivedData, scenes }` to S3.
8. Return the object to the frontend.

`/api/generated-states.js`:
1. Run S3 `ListObjectsV2` with prefix `generated-text/`.
2. Return array of state names (derived from the S3 keys) that have
   cached text.

---

## Mock mode for local testing

Add a `MOCK_MODE` env var. When true, `/api/get-story` skips the Claude
API call entirely and returns the New York reference example above
(with `state` swapped to whatever was requested) — lets you build and
test the full frontend/typing mechanics without burning API credits or
needing real S3 access for every test state.

---

## Environment variables

```
ANTHROPIC_API_KEY=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
S3_BUCKET_NAME=
MOCK_MODE=false
```

Set in Vercel dashboard for production; mirror in `.env.local`
(gitignored) for local `vercel dev`.


---

## Build order

1. Static frontend shell: Tab 1–4 navigation, Scene 1 (fully static,
   no generation), background images wired in with correct CSS
   text-safe zones.
2. `/api/get-story.js` in `MOCK_MODE` — wire up Scenes 2–4 rendering
   with the New York reference text so typing mechanics can be built
   and tested without real API calls.
3. Typing engine: keystroke diffing, live WPM/accuracy, scene
   transitions.
4. Scene 5: scoring, star rating, username save (session), download.
5. Real S3 integration + real Claude API call, `MOCK_MODE=false`.
   Test with 2–3 real states.
6. Tab 3 map + `/api/generated-states.js`.
7. Scene 4's mini-map (reuse Tab 3's map component, filtered to 3
   states).
8. Error handling: API failure → fallback story; S3 failure → surface
   a friendly retry message, not a broken scene.
9. Deploy to Vercel, connect env vars, verify cold-start (new state)
   and cached-state paths both work in production.

## Data source
- reference this source in the end of the About page. use the exact format.

US Environmental Protection Agency. Air Quality System Data Mart [internet database] available via https://www.epa.gov/outdoor-air-quality-data. Accessed May 09, 2026. Pollutants: PM2.5 (param 88101), Ozone 8-hr max (param 44201). 2025 data may be preliminary.
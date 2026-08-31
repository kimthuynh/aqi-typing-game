const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You are writing narration for Skye, a small, friendly, curious pigeon
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
  markdown fences, no preamble, no explanation text.`;

function buildUserPrompt(state, d) {
  const y = d.yearly || {};
  const yoy = d.yoy || {};
  return `State: ${state}

Data for Scene 2 (trend overview, 2023-2025):
- PM2.5 average AQI: 2023 = ${y[2023]?.pm25 ?? 'n/a'}, 2024 = ${y[2024]?.pm25 ?? 'n/a'}, 2025 = ${y[2025]?.pm25 ?? 'n/a'}
- Ozone average AQI: 2023 = ${y[2023]?.ozone ?? 'n/a'}, 2024 = ${y[2024]?.ozone ?? 'n/a'}, 2025 = ${y[2025]?.ozone ?? 'n/a'}
- PM2.5 YoY change: 2023->2024 = ${yoy.pm25_23to24 ?? 'n/a'}%, 2024->2025 = ${yoy.pm25_24to25 ?? 'n/a'}%
- Ozone YoY change: 2023->2024 = ${yoy.ozone_23to24 ?? 'n/a'}%, 2024->2025 = ${yoy.ozone_24to25 ?? 'n/a'}%

Data for Scene 3 (best/worst month):
- Best month for air quality: ${d.bestMonth ?? 'n/a'}
- Worst month for air quality: ${d.worstMonth ?? 'n/a'}
(If a plausible seasonal driver is well known — e.g. summer heat raising
ozone, winter inversion trapping PM2.5, regional wildfire season — you
may mention it briefly and with appropriate hedging. Do not state a
cause as fact if you're not confident it applies.)

Data for Scene 4 (state comparison, 2025):
- ${state} unhealthy days: ${d.unhealthyDays2025 ?? 'n/a'}, ranked #${d.stateRank2025 ?? 'n/a'} of ${d.totalStates ?? 50} (1 = fewest unhealthy days = best)
- Best state nationally: ${d.bestState?.name ?? 'n/a'}, ${d.bestState?.days ?? 'n/a'} unhealthy days
- Worst state nationally: ${d.worstState?.name ?? 'n/a'}, ${d.worstState?.days ?? 'n/a'} unhealthy days
- State ranked just better than ${state}: ${d.neighborState?.name ?? 'n/a'}, ${d.neighborState?.days ?? 'n/a'} unhealthy days

Write Scene 2, Scene 3, and Scene 4 following the system rules. Return
this exact JSON shape and nothing else:

{
  "scene2": "...",
  "scene3": "...",
  "scene4": "..."
}`;
}

function parseScenes(text) {
  const trimmed = String(text || '').trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  const obj = JSON.parse(trimmed);
  if (!obj || !obj.scene2 || !obj.scene3 || !obj.scene4) {
    throw new Error('Missing scene fields in Claude response');
  }
  return { scene2: obj.scene2, scene3: obj.scene3, scene4: obj.scene4 };
}

async function generateScenes(state, derived) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const userPrompt = buildUserPrompt(state, derived);

  const attempt = async () => {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const text = (res.content || []).map((b) => b.text || '').join('');
    return parseScenes(text);
  };

  try {
    return await attempt();
  } catch (err) {
    console.warn('Claude first attempt failed:', err.message);
    return await attempt();
  }
}

module.exports = { generateScenes, MODEL, SYSTEM_PROMPT, buildUserPrompt };

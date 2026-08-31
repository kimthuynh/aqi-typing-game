const NY_REFERENCE = {
  scene2: "Three years of flying over New York, and I've watched the air do something interesting. Back in 2023, PM2.5 was thick enough that I noticed it on my daily loops. Then 2024 gave us a real break — down 13.5% from the year before. I got used to crisper mornings. But in 2025, that improvement slipped, PM2.5 ticked up +2%, and ozone jumped +9% from last year. So it's not a straight line up or down — more like 2 steps forward, then half a step back. Worth knowing if you plan outdoor time around clear skies.",
  scene3: "If you want my flying calendar for New York: June is the month I stay closer to the treeline. Across the last 3 summers, June has consistently been the roughest stretch for both PM2.5 and ozone — some years worse than others when wildfire smoke drifts in from the north. November's the opposite: crisp, cool, and about as clear as the sky gets here all year. So if you're planning something outdoors that matters — a big hike, a day at the park — November's your best bet, and June's the month to check the air first.",
  scene4: "Here's the honest picture: in 2025, New York had 30 days where the air wasn't great — out of 50 states, that's #46, closer to the rough end than the clear end. Nevada, right next door in the rankings, had just 29 — 1 day fewer than you. Compare that to Hawaii: 0 unhealthy days all year. And then there's California, with 154 — 5x what New York saw. So New York isn't the best story in the country, but it's nowhere near the worst either. You're in the middle of the pack, with real room to climb.",
};

const GENERIC_FALLBACK = {
  scene2: "Three years of flying over your state, and I've watched the air shift. Some years the mornings turn crisp; other years the horizon hazes. Both PM2.5 and ozone tell part of the story, and neither moves in a straight line. What I've learned: the trend isn't the whole picture — the year-to-year swings matter too. So don't judge a place by any single number. Watch the pattern instead, and you start to see the sky more honestly.",
  scene3: "If you want my flying calendar: I aim for the cool months when I can, and I keep low on the days that feel heavy. Air quality has a rhythm — summer heat tends to lift ozone, winter can trap fine particles closer to the ground, and wildfire smoke rewrites the calendar entirely. Not every state follows the same script. But there's always a best window if you look for it. Pick your outdoor days by the weather and the wind, and your lungs will thank you.",
  scene4: "Here's the honest picture: every state has its story, and no two years line up the same. Some places have almost no unhealthy air days; others hit triple digits when wildfires blow through. Comparing your state to a neighbor tells you more than a national average ever will. And comparing to the extremes — the cleanest state and the roughest — puts the number in scale. Wherever you land, remember: the ranking isn't destiny. Every clean day is a chance to earn a better spot.",
};

const NY_DERIVED = {
  yearly: {
    2023: { pm25: 46.08, ozone: 36.68 },
    2024: { pm25: 39.86, ozone: 36.49 },
    2025: { pm25: 40.66, ozone: 39.77 },
  },
  yoy: { pm25_23to24: -13.5, pm25_24to25: 2.0, ozone_23to24: -0.5, ozone_24to25: 9.0 },
  bestMonth: 'November',
  worstMonth: 'June',
  stateRank2025: 46,
  totalStates: 50,
  unhealthyDays2025: 30,
  bestState: { name: 'Hawaii', days: 0 },
  worstState: { name: 'California', days: 154 },
  neighborState: { name: 'Nevada', days: 29 },
};

module.exports = { NY_REFERENCE, GENERIC_FALLBACK, NY_DERIVED };

const { NON_STATE_ROWS, canonicalize } = require('./states');

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function mean(arr) {
  const vals = arr.filter((x) => x !== null && x !== undefined && !Number.isNaN(x));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function round1(n) {
  return n === null ? null : Math.round(n * 10) / 10;
}

function pctChange(a, b) {
  if (a === null || b === null || a === 0) return null;
  return round1(((b - a) / Math.abs(a)) * 100);
}

function filterStateRows(rows) {
  return rows.filter((r) => r && r.State_name && !NON_STATE_ROWS.has(r.State_name));
}

function computeYearly(stateRows) {
  const byYear = {};
  for (const r of stateRows) {
    const year = Number(r.Year);
    if (!year) continue;
    if (!byYear[year]) byYear[year] = { pm25: [], ozone: [] };
    const pm25 = num(r.pm25_avg_aqi);
    const ozone = num(r.ozone_avg_aqi);
    if (pm25 !== null) byYear[year].pm25.push(pm25);
    if (ozone !== null) byYear[year].ozone.push(ozone);
  }
  const out = {};
  for (const y of [2023, 2024, 2025]) {
    const bucket = byYear[y] || { pm25: [], ozone: [] };
    out[y] = {
      pm25: round1(mean(bucket.pm25)),
      ozone: round1(mean(bucket.ozone)),
    };
  }
  return out;
}

function computeMonthBestWorst(stateRows) {
  const byMonth = {};
  for (const r of stateRows) {
    const m = Number(r.Month);
    if (!m || m < 1 || m > 12) continue;
    if (!byMonth[m]) byMonth[m] = [];
    const pm25 = num(r.pm25_avg_aqi);
    const ozone = num(r.ozone_avg_aqi);
    const parts = [];
    if (pm25 !== null) parts.push(pm25);
    if (ozone !== null) parts.push(ozone);
    if (parts.length) byMonth[m].push(mean(parts));
  }
  const monthScores = Object.entries(byMonth).map(([m, arr]) => ({
    month: Number(m),
    score: mean(arr),
  })).filter((x) => x.score !== null);
  if (!monthScores.length) return { bestMonth: null, worstMonth: null };
  monthScores.sort((a, b) => a.score - b.score);
  return {
    bestMonth: MONTH_NAMES[monthScores[0].month - 1],
    worstMonth: MONTH_NAMES[monthScores[monthScores.length - 1].month - 1],
  };
}

function computeStateRanking(allRows, targetState, year = 2025) {
  const daysByState = {};
  for (const r of allRows) {
    if (!r || !r.State_name) continue;
    if (NON_STATE_ROWS.has(r.State_name)) continue;
    if (Number(r.Year) !== year) continue;
    const canonical = canonicalize(r.State_name);
    if (!canonical) continue;
    const unhealthy = num(r.Unhealthy_days) || 0;
    const veryUnhealthy = num(r.Very_unhealthy_days) || 0;
    daysByState[canonical] = (daysByState[canonical] || 0) + unhealthy + veryUnhealthy;
  }
  const ranked = Object.entries(daysByState).sort((a, b) => a[1] - b[1]);
  const totalStates = ranked.length;
  const stateIdx = ranked.findIndex(([name]) => name === targetState);
  const stateRank = stateIdx >= 0 ? stateIdx + 1 : null;
  const stateDays = stateIdx >= 0 ? Math.round(ranked[stateIdx][1]) : null;
  const bestState = ranked[0] ? { name: ranked[0][0], days: Math.round(ranked[0][1]) } : null;
  const worstState = ranked.length ? {
    name: ranked[ranked.length - 1][0],
    days: Math.round(ranked[ranked.length - 1][1]),
  } : null;
  const neighbor = stateIdx > 0 ? ranked[stateIdx - 1] : null;
  const neighborState = neighbor
    ? { name: neighbor[0], days: Math.round(neighbor[1]) }
    : null;
  return {
    stateRank2025: stateRank,
    totalStates,
    unhealthyDays2025: stateDays,
    bestState,
    worstState,
    neighborState,
  };
}

function deriveForState(rows, targetState) {
  const canonical = canonicalize(targetState);
  if (!canonical) throw new Error(`Unknown state: ${targetState}`);
  const cleanRows = filterStateRows(rows);
  const stateRows = cleanRows.filter((r) => canonicalize(r.State_name) === canonical);

  const yearly = computeYearly(stateRows);
  const yoy = {
    pm25_23to24: pctChange(yearly[2023].pm25, yearly[2024].pm25),
    pm25_24to25: pctChange(yearly[2024].pm25, yearly[2025].pm25),
    ozone_23to24: pctChange(yearly[2023].ozone, yearly[2024].ozone),
    ozone_24to25: pctChange(yearly[2024].ozone, yearly[2025].ozone),
  };
  const { bestMonth, worstMonth } = computeMonthBestWorst(stateRows);
  const ranking = computeStateRanking(cleanRows, canonical, 2025);

  return {
    yearly,
    yoy,
    bestMonth,
    worstMonth,
    ...ranking,
  };
}

module.exports = { deriveForState, filterStateRows, MONTH_NAMES };

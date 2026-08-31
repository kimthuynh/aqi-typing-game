const Papa = require('papaparse');

const TTL_MS = 60 * 60 * 1000; // 1 hour
let cache = { data: null, fetchedAt: 0 };

async function load() {
  const now = Date.now();
  if (cache.data && now - cache.fetchedAt < TTL_MS) return cache.data;

  const url = process.env.AQI_CSV_URL;
  if (!url) throw new Error('AQI_CSV_URL not configured');

  const res = await fetch(url);
  if (!res.ok) throw new Error(`CSV fetch failed: ${res.status} ${res.statusText}`);
  const text = await res.text();

  const parsed = Papa.parse(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });
  if (parsed.errors && parsed.errors.length) {
    console.warn('CSV parse warnings:', parsed.errors.slice(0, 3));
  }

  cache = { data: parsed.data, fetchedAt: now };
  return parsed.data;
}

function _resetForTest() {
  cache = { data: null, fetchedAt: 0 };
}

module.exports = { load, _resetForTest };

const s3 = require('./_lib/s3');

async function pMap(items, mapper, concurrency = 10) {
  const out = new Array(items.length);
  let i = 0;
  const workers = new Array(Math.min(concurrency, items.length)).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await mapper(items[idx], idx); }
      catch (err) { out[idx] = null; }
    }
  });
  await Promise.all(workers);
  return out;
}

module.exports = async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();

    const mockMode = String(process.env.MOCK_MODE || '').toLowerCase() === 'true';
    if (mockMode) {
      const demo = [
        { username: 'skye', state: 'New York', totals: { wpm: 62, accuracy: 96, durationSec: 118, stars: 4 }, savedAt: new Date().toISOString() },
        { username: 'demo123', state: 'California', totals: { wpm: 48, accuracy: 92, durationSec: 145, stars: 3 }, savedAt: new Date().toISOString() },
      ];
      const filtered = q ? demo.filter((r) => r.username.toLowerCase().includes(q)) : demo;
      return res.status(200).json({ scores: filtered });
    }

    let keys = await s3.listKeys('scores/');
    if (q) {
      keys = keys.filter((k) => k.replace(/^scores\//, '').replace(/\.json$/, '').toLowerCase().includes(q));
    }

    const now = Date.now();
    const records = await pMap(keys, async (k) => {
      const r = await s3.getJson(k);
      if (r && r.expiresAt && now > Date.parse(r.expiresAt)) return null;
      return r;
    }, 15);

    const scores = records
      .filter(Boolean)
      .sort((a, b) => (Date.parse(b.savedAt) || 0) - (Date.parse(a.savedAt) || 0));
    return res.status(200).json({ scores });
  } catch (err) {
    console.error('get-scores error:', err);
    return res.status(500).json({ error: err.message || 'Internal error', scores: [] });
  }
};

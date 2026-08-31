const s3 = require('./_lib/s3');
const { scoreKey, canonicalize } = require('./_lib/states');

function sanitize(u) {
  return String(u || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

function suggest(base) {
  const clean = sanitize(base) || 'skye';
  const suffix = Math.floor(Math.random() * 900) + 100;
  return `${clean}${suffix}`;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }
  try {
    const body = await readBody(req);
    const username = sanitize(body.username);
    if (!username || username.length < 2) {
      return res.status(400).json({ error: 'Invalid username' });
    }
    const state = canonicalize(body.state);
    if (!state) return res.status(400).json({ error: 'Invalid state' });

    const totals = body.totals || {};
    const scenes = body.scenes || {};
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const mockMode = String(process.env.MOCK_MODE || '').toLowerCase() === 'true';
    const key = scoreKey(username);

    if (!mockMode) {
      const taken = await s3.exists(key);
      if (taken) {
        return res.status(409).json({
          error: 'Username taken',
          suggestion: suggest(username),
        });
      }
    } else {
      if (username === 'taken') {
        return res.status(409).json({ error: 'Username taken', suggestion: suggest(username) });
      }
    }

    const record = {
      username,
      state,
      totals: {
        wpm: Number(totals.wpm) || 0,
        accuracy: Number(totals.accuracy) || 0,
        durationSec: Number(totals.durationSec) || 0,
        stars: Number(totals.stars) || 0,
      },
      scenes: {
        scene2: scenes.scene2 || null,
        scene3: scenes.scene3 || null,
        scene4: scenes.scene4 || null,
      },
      savedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    if (!mockMode) {
      await s3.putJson(key, record);
    }
    return res.status(201).json(record);
  } catch (err) {
    console.error('save-score error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
};

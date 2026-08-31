const s3 = require('./_lib/s3');
const { scoreKey } = require('./_lib/states');

function sanitize(u) {
  return String(u || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

function suggest(base) {
  const clean = sanitize(base) || 'skye';
  const suffix = Math.floor(Math.random() * 900) + 100; // 100-999
  return `${clean}${suffix}`;
}

module.exports = async function handler(req, res) {
  try {
    const raw = req.query.username;
    const username = sanitize(raw);
    if (!username || username.length < 2) {
      return res.status(400).json({ error: 'Username must be at least 2 characters (a-z, 0-9, -, _).' });
    }

    const mockMode = String(process.env.MOCK_MODE || '').toLowerCase() === 'true';
    if (mockMode) {
      // Local mock: pretend only "taken" is taken.
      if (username === 'taken') {
        return res.status(200).json({ available: false, username, suggestion: suggest(username) });
      }
      return res.status(200).json({ available: true, username });
    }

    const key = scoreKey(username);
    const taken = await s3.exists(key);
    if (taken) {
      return res.status(200).json({ available: false, username, suggestion: suggest(username) });
    }
    return res.status(200).json({ available: true, username });
  } catch (err) {
    console.error('check-username error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
};

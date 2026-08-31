const s3 = require('./_lib/s3');
const { stateFromKey } = require('./_lib/states');

module.exports = async function handler(req, res) {
  try {
    const mockMode = String(process.env.MOCK_MODE || '').toLowerCase() === 'true';
    if (mockMode) {
      return res.status(200).json({ states: ['New York', 'California', 'Hawaii'] });
    }
    const keys = await s3.listKeys('generated-text/');
    const states = keys
      .map((k) => stateFromKey(k))
      .filter(Boolean);
    return res.status(200).json({ states });
  } catch (err) {
    console.error('generated-states error:', err);
    return res.status(500).json({ error: err.message || 'Internal error', states: [] });
  }
};

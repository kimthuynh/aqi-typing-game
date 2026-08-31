const { canonicalize, storyKey } = require('./_lib/states');
const s3 = require('./_lib/s3');
const csv = require('./_lib/csv');
const { deriveForState } = require('./_lib/derive');
const { generateScenes, MODEL } = require('./_lib/claude');
const { NY_REFERENCE, GENERIC_FALLBACK, NY_DERIVED } = require('./_lib/fallback');

module.exports = async function handler(req, res) {
  try {
    const state = canonicalize(req.query.state);
    if (!state) {
      return res.status(400).json({ error: 'Unknown or missing state' });
    }

    const key = storyKey(state);
    const mockMode = String(process.env.MOCK_MODE || '').toLowerCase() === 'true';

    // 1. Check cache (skip in mock mode to keep dev iteration flexible)
    if (!mockMode) {
      if (await s3.exists(key)) {
        const cached = await s3.getJson(key);
        return res.status(200).json({ ...cached, cached: true });
      }
    }

    let derived;
    let scenes;

    if (mockMode) {
      derived = { ...NY_DERIVED };
      scenes = {
        scene2: NY_REFERENCE.scene2.replace(/New York/g, state),
        scene3: NY_REFERENCE.scene3.replace(/New York/g, state),
        scene4: NY_REFERENCE.scene4.replace(/New York/g, state),
      };
    } else {
      const rows = await csv.load();
      derived = deriveForState(rows, state);
      try {
        scenes = await generateScenes(state, derived);
      } catch (err) {
        console.error('Claude generation failed after retry, using fallback:', err.message);
        scenes = { ...GENERIC_FALLBACK };
      }
    }

    const payload = {
      state,
      generatedAt: new Date().toISOString(),
      model: MODEL,
      derivedData: derived,
      scenes,
    };

    // Only write to S3 for real generations; mock outputs stay ephemeral.
    if (!mockMode) {
      try {
        await s3.putJson(key, payload);
      } catch (err) {
        console.error('S3 write failed (returning payload anyway):', err.message);
      }
    }

    return res.status(200).json({ ...payload, cached: false });
  } catch (err) {
    console.error('get-story error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
};

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
  'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho',
  'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana',
  'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
  'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
  'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
  'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
  'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
  'West Virginia', 'Wisconsin', 'Wyoming',
];

const NON_STATE_ROWS = new Set([
  'Country Of Mexico',
  'Puerto Rico',
  'Virgin Islands',
  'District Of Columbia',
]);

function slugify(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function canonicalize(name) {
  const slug = slugify(name);
  return US_STATES.find((s) => slugify(s) === slug) || null;
}

function isRealState(name) {
  return canonicalize(name) !== null;
}

function storyKey(state) {
  const canonical = canonicalize(state);
  if (!canonical) throw new Error(`Unknown state: ${state}`);
  return `generated-text/${slugify(canonical)}.json`;
}

function scoreKey(username) {
  const clean = String(username || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return `scores/${clean}.json`;
}

function stateFromKey(key) {
  const slug = key.replace(/^generated-text\//, '').replace(/\.json$/, '');
  return US_STATES.find((s) => slugify(s) === slug) || null;
}

module.exports = {
  US_STATES,
  NON_STATE_ROWS,
  slugify,
  canonicalize,
  isRealState,
  storyKey,
  scoreKey,
  stateFromKey,
};

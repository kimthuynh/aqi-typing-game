/* AQI Typing Adventure — main controller.
   Ties together tabs, scenes, typing engine, API calls, and Tab 2/3 views. */
(function () {
  const US_STATES = [
    'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
    'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
    'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
    'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada',
    'New Hampshire','New Jersey','New Mexico','New York','North Carolina',
    'North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island',
    'South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont',
    'Virginia','Washington','West Virginia','Wisconsin','Wyoming',
  ];

  // ---------- state ----------
  const state = {
    selectedState: null,
    story: null,               // { scenes: { scene2, scene3, scene4 }, derivedData, ... }
    sceneStats: {},            // { scene2: {wpm,accuracy,durationSec}, ... }
    activeScene: 'landing',
    typers: {},                // scene id -> typing engine instance
    scoresCache: [],
    scoresSort: { key: 'savedAt', dir: 'desc' },
  };

  // ---------- tab router ----------
  function switchTab(name) {
    document.querySelectorAll('.tab-btn').forEach((b) => {
      const on = b.dataset.tab === name;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('[data-tab-panel]').forEach((p) => {
      p.classList.toggle('is-active', p.dataset.tabPanel === name);
    });
    if (name === 'scores') loadScores();
    if (name === 'map') loadMap();
  }

  document.querySelectorAll('.tab-btn').forEach((b) => {
    b.addEventListener('click', () => switchTab(b.dataset.tab));
  });

  // ---------- state select ----------
  const stateSelect = document.getElementById('state-select');
  US_STATES.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    stateSelect.appendChild(opt);
  });

  const startBtn = document.getElementById('btn-start');
  const randomBtn = document.getElementById('btn-random');
  const hintEl = document.getElementById('landing-hint');

  stateSelect.addEventListener('change', () => {
    startBtn.disabled = !stateSelect.value;
  });

  randomBtn.addEventListener('click', async () => {
    hintEl.textContent = 'Looking for a cached story…';
    try {
      const res = await fetch('/api/generated-states');
      const data = await res.json();
      const pool = Array.isArray(data.states) && data.states.length ? data.states : US_STATES;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      stateSelect.value = pick;
      startBtn.disabled = false;
      hintEl.textContent = data.states && data.states.length
        ? `Skye picked ${pick} — cached story ready!`
        : `Skye picked ${pick} — first flight there, generating fresh text.`;
    } catch {
      const pick = US_STATES[Math.floor(Math.random() * US_STATES.length)];
      stateSelect.value = pick;
      startBtn.disabled = false;
      hintEl.textContent = `Skye picked ${pick}.`;
    }
  });

  startBtn.addEventListener('click', () => {
    state.selectedState = stateSelect.value;
    if (!state.selectedState) return;
    startBtn.disabled = true;
    hintEl.textContent = 'Fetching story…';
    fetchStory(state.selectedState).then((story) => {
      state.story = story;
      hintEl.textContent = '';
      document.querySelectorAll('[data-slot="state-name"]').forEach((el) => {
        el.textContent = state.selectedState;
      });
      populateKpiPanels(story);
      prepScenes(story);
      showScene('scene1');
    }).catch((err) => {
      hintEl.textContent = `Trouble fetching story: ${err.message}. Try again?`;
      startBtn.disabled = false;
    });
  });

  function populateKpiPanels(story) {
    const d = (story && story.derivedData) || {};
    const y2025 = (d.yearly && d.yearly[2025]) || {};
    const pm25 = y2025.pm25;
    const ozone = y2025.ozone;
    const unhealthy = d.unhealthyDays2025;
    const pm25Txt = (pm25 == null) ? '—' : `${pm25} AQI`;
    const ozoneTxt = (ozone == null) ? '—' : `${ozone} AQI`;
    let unhealthyTxt = '—';
    if (unhealthy != null) {
      const pct = Math.round((unhealthy / 365) * 1000) / 10;
      unhealthyTxt = `${unhealthy} ${unhealthy === 1 ? 'day' : 'days'} (${pct}%)`;
    }
    document.querySelectorAll('[data-kpi="pm25"]').forEach((el) => { el.textContent = pm25Txt; });
    document.querySelectorAll('[data-kpi="ozone"]').forEach((el) => { el.textContent = ozoneTxt; });
    document.querySelectorAll('[data-kpi="unhealthy"]').forEach((el) => { el.textContent = unhealthyTxt; });
  }

  async function fetchStory(stateName) {
    const res = await fetch(`/api/get-story?state=${encodeURIComponent(stateName)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  // ---------- scene transitions ----------
  function showScene(sceneId) {
    document.querySelectorAll('.scene').forEach((s) => {
      const on = s.dataset.scene === sceneId;
      if (on) {
        s.classList.add('is-active');
      } else {
        s.classList.remove('is-active');
      }
    });
    state.activeScene = sceneId;

    // Any pause overlay is scene-local — clear it on transition.
    const pauseEl = document.querySelector('[data-pause-overlay]');
    if (pauseEl) pauseEl.hidden = true;

    // Deactivate all typers, activate the new one if it's a typing scene.
    Object.entries(state.typers).forEach(([id, t]) => {
      if (id === sceneId) t.activate();
      else t.deactivate();
    });

    if (sceneId === 'scene5') renderScoreSummary();
  }

  document.querySelectorAll('[data-action="next-scene"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const currentScene = btn.closest('.scene').dataset.scene;
      const order = ['scene1', 'scene2', 'scene3', 'scene4'];
      const idx = order.indexOf(currentScene);
      if (idx >= 0) {
        if (currentScene !== 'scene1') {
          // Record stats before moving on.
          const t = state.typers[currentScene];
          if (t) state.sceneStats[currentScene] = t.stats();
        }
        const next = order[idx + 1];
        if (next) showScene(next);
      }
    });
  });

  function submitFromCurrentScene(btn) {
    const id = btn.closest('.scene').dataset.scene;
    if (isTypingScene(id)) {
      const t = state.typers[id];
      if (t) state.sceneStats[id] = t.stats();
    }
    const overlay = document.querySelector('[data-pause-overlay]');
    if (overlay) overlay.hidden = true;
    showScene('scene5');
  }
  document.querySelectorAll('[data-action="submit-scores"], [data-action="submit-early"]').forEach((btn) => {
    btn.addEventListener('click', () => submitFromCurrentScene(btn));
  });

  // ---------- pause / resume / finish-early ----------
  const pauseOverlay = document.querySelector('[data-pause-overlay]');

  function isTypingScene(id) {
    return id === 'scene2' || id === 'scene3' || id === 'scene4';
  }

  function pauseCurrent() {
    const id = state.activeScene;
    if (!isTypingScene(id)) return;
    const t = state.typers[id];
    if (!t) return;
    t.pause();
    pauseOverlay.hidden = false;
  }

  function resumeCurrent() {
    const id = state.activeScene;
    const t = state.typers[id];
    if (t) t.resume();
    pauseOverlay.hidden = true;
  }

  function finishEarly() {
    // Capture partial stats for whatever scene the user was on,
    // leave earlier scenes' recorded stats intact, mark unreached as zero.
    const id = state.activeScene;
    if (isTypingScene(id) && state.typers[id]) {
      state.sceneStats[id] = state.typers[id].stats();
    }
    pauseOverlay.hidden = true;
    showScene('scene5');
  }

  document.querySelectorAll('[data-action="pause"]').forEach((btn) => {
    btn.addEventListener('click', pauseCurrent);
  });
  document.querySelectorAll('[data-action="resume"]').forEach((btn) => {
    btn.addEventListener('click', resumeCurrent);
  });
  document.querySelectorAll('[data-action="finish-early"]').forEach((btn) => {
    btn.addEventListener('click', finishEarly);
  });

  // Escape key toggles pause during typing scenes.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!isTypingScene(state.activeScene)) return;
    if (pauseOverlay.hidden) pauseCurrent();
    else resumeCurrent();
  });

  // ---------- scene text prep ----------
  function prepScenes(story) {
    state.sceneStats = {};
    ['scene2', 'scene3', 'scene4'].forEach((id) => {
      const container = document.querySelector(`.scene[data-scene="${id}"]`);
      const text = story.scenes[id] || '';
      if (!state.typers[id]) {
        state.typers[id] = TypingEngine.create(container);
      }
      state.typers[id].reset(text);
    });
  }

  // ---------- Scene 5 ----------
  // Composite per-scene score: 60% accuracy + 40% normalized WPM (0-100 scale).
  function sceneScore(s) {
    if (!s || !s.durationSec) return null;
    const wpmNorm = Math.min(100, s.wpm || 0);
    return Math.round(0.6 * (s.accuracy || 0) + 0.4 * wpmNorm);
  }

  function starRating(score) {
    if (score >= 85) return 5;
    if (score >= 75) return 4;
    if (score >= 65) return 3;
    if (score >= 55) return 2;
    return 1;
  }

  function computeTotals() {
    const scenes = ['scene2', 'scene3', 'scene4'];
    // Only include scenes the user actually attempted (durationSec > 0).
    const played = scenes.map((id) => state.sceneStats[id]).filter((s) => s && s.durationSec > 0);
    const totalDur = played.reduce((a, b) => a + b.durationSec, 0);
    const totalChars = played.reduce((a, b) => a + (b.chars || 0), 0);
    const avgAcc = played.length ? Math.round(played.reduce((a, b) => a + b.accuracy, 0) / played.length) : 0;
    const totalWpm = totalDur > 0 ? Math.round((totalChars / 5) / (totalDur / 60)) : 0;
    const perScene = played.map(sceneScore).filter((v) => v !== null);
    const avgScore = perScene.length ? Math.round(perScene.reduce((a, b) => a + b, 0) / perScene.length) : 0;
    return {
      score: avgScore,
      wpm: totalWpm,
      accuracy: avgAcc,
      durationSec: Math.round(totalDur * 10) / 10,
      stars: perScene.length ? starRating(avgScore) : 0,
      scenesPlayed: played.length,
    };
  }

  function renderScoreSummary() {
    const totals = computeTotals();
    document.querySelector('[data-final="score"]').textContent = totals.score;
    document.querySelector('[data-final="wpm"]').textContent = totals.wpm;
    document.querySelector('[data-final="accuracy"]').textContent = `${totals.accuracy}%`;
    document.querySelector('[data-final="time"]').textContent = `${totals.durationSec}s`;

    // Change the title if user finished early.
    const titleEl = document.querySelector('.score-title');
    if (titleEl) {
      titleEl.textContent = totals.scenesPlayed === 0
        ? "Skye's waiting on you."
        : totals.scenesPlayed < 3
          ? 'Landing early — nice flight so far.'
          : 'Nice flying, pilot.';
    }

    const starsEl = document.querySelector('[data-stars]');
    starsEl.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const span = document.createElement('span');
      span.className = 'star' + (i < totals.stars ? '' : ' dim');
      span.textContent = '★';
      span.style.animationDelay = `${i * 100}ms`;
      starsEl.appendChild(span);
    }

    const body = document.querySelector('[data-breakdown]');
    body.innerHTML = '';
    ['scene2', 'scene3', 'scene4'].forEach((id, i) => {
      const st = state.sceneStats[id];
      const tr = document.createElement('tr');
      if (!st || !st.durationSec) {
        tr.innerHTML = `<td>Scene ${i + 2}</td><td>—</td><td>—</td><td>—</td><td>—</td>`;
      } else {
        const sc = sceneScore(st);
        tr.innerHTML = `<td>Scene ${i + 2}</td><td class="num">${sc}</td><td class="num">${st.wpm}</td><td class="num">${st.accuracy}%</td><td class="num">${st.durationSec.toFixed(1)}s</td>`;
      }
      body.appendChild(tr);
    });

    state._totals = totals;
  }

  // Save score flow
  const saveInput = document.getElementById('save-username');
  const saveBtn = document.getElementById('btn-save');
  const saveMsg = document.querySelector('[data-save-msg]');

  saveInput.addEventListener('blur', async () => {
    const u = saveInput.value.trim();
    if (u.length < 2) return;
    try {
      const res = await fetch(`/api/check-username?username=${encodeURIComponent(u)}`);
      const data = await res.json();
      if (data.available === false) {
        saveMsg.className = 'save-msg is-error';
        saveMsg.textContent = `Taken. Try “${data.suggestion}”?`;
        saveMsg.dataset.suggestion = data.suggestion;
      } else {
        saveMsg.className = 'save-msg is-ok';
        saveMsg.textContent = 'Nice name — that one is open.';
      }
    } catch {}
  });

  saveMsg.addEventListener('click', () => {
    if (saveMsg.dataset.suggestion) {
      saveInput.value = saveMsg.dataset.suggestion;
      saveMsg.textContent = '';
      delete saveMsg.dataset.suggestion;
    }
  });

  saveBtn.addEventListener('click', async () => {
    const username = saveInput.value.trim();
    if (username.length < 2) {
      saveMsg.className = 'save-msg is-error';
      saveMsg.textContent = 'Name must be at least 2 characters.';
      return;
    }
    saveBtn.disabled = true;
    const totals = state._totals || computeTotals();
    const body = {
      username,
      state: state.selectedState,
      totals,
      scenes: state.sceneStats,
    };
    try {
      const res = await fetch('/api/save-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.status === 201) {
        saveMsg.className = 'save-msg is-ok';
        saveMsg.textContent = `Saved! Look for “${username}” on the Scores tab.`;
      } else if (res.status === 409) {
        saveMsg.className = 'save-msg is-error';
        saveMsg.textContent = `Taken. Try “${data.suggestion}”?`;
        saveMsg.dataset.suggestion = data.suggestion;
      } else {
        saveMsg.className = 'save-msg is-error';
        saveMsg.textContent = data.error || 'Save failed.';
      }
    } catch (err) {
      saveMsg.className = 'save-msg is-error';
      saveMsg.textContent = `Save failed: ${err.message}`;
    } finally {
      saveBtn.disabled = false;
    }
  });

  // Download JSON / CSV
  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  document.getElementById('btn-download-json').addEventListener('click', () => {
    const payload = {
      state: state.selectedState,
      playedAt: new Date().toISOString(),
      totals: state._totals || computeTotals(),
      scenes: state.sceneStats,
    };
    download(`aqi-typing-${state.selectedState || 'run'}.json`, JSON.stringify(payload, null, 2), 'application/json');
  });

  document.getElementById('btn-download-csv').addEventListener('click', () => {
    const totals = state._totals || computeTotals();
    const rows = [
      ['scene', 'wpm', 'accuracy', 'durationSec', 'chars'],
      ...['scene2','scene3','scene4'].map((id) => {
        const s = state.sceneStats[id] || { wpm: 0, accuracy: 0, durationSec: 0, chars: 0 };
        return [id, s.wpm, s.accuracy, s.durationSec, s.chars];
      }),
      ['total', totals.wpm, totals.accuracy, totals.durationSec, ''],
    ];
    download(`aqi-typing-${state.selectedState || 'run'}.csv`, rows.map((r) => r.join(',')).join('\n'), 'text/csv');
  });

  document.getElementById('btn-play-again').addEventListener('click', () => {
    state.story = null;
    state.sceneStats = {};
    saveInput.value = '';
    saveMsg.textContent = '';
    delete saveMsg.dataset.suggestion;
    startBtn.disabled = !stateSelect.value;
    showScene('landing');
  });

  // ---------- Tab 2: Scores ----------
  const scoresBody = document.getElementById('scores-body');
  const scoreSearch = document.getElementById('score-search');
  let searchTimer = 0;

  async function loadScores(q = '') {
    scoresBody.innerHTML = '<tr><td colspan="6" class="empty">Loading…</td></tr>';
    try {
      const url = q ? `/api/get-scores?q=${encodeURIComponent(q)}` : '/api/get-scores';
      const res = await fetch(url);
      const data = await res.json();
      state.scoresCache = data.scores || [];
      renderScores();
    } catch (err) {
      scoresBody.innerHTML = `<tr><td colspan="6" class="empty">Couldn't load scores: ${err.message}</td></tr>`;
    }
  }

  function renderScores() {
    const rows = [...state.scoresCache];
    const { key, dir } = state.scoresSort;
    const getVal = (r) => {
      if (key === 'username') return r.username || '';
      if (key === 'state') return r.state || '';
      if (key === 'wpm') return r.totals?.wpm || 0;
      if (key === 'accuracy') return r.totals?.accuracy || 0;
      if (key === 'stars') return r.totals?.stars || 0;
      if (key === 'savedAt') return Date.parse(r.savedAt) || 0;
      return 0;
    };
    rows.sort((a, b) => {
      const va = getVal(a), vb = getVal(b);
      const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return dir === 'asc' ? cmp : -cmp;
    });

    if (!rows.length) {
      scoresBody.innerHTML = '<tr><td colspan="6" class="empty">No scores yet. Fly a state and save one!</td></tr>';
      return;
    }
    scoresBody.innerHTML = '';
    rows.forEach((r, i) => {
      const t = r.totals || {};
      const tr = document.createElement('tr');
      tr.style.animationDelay = `${i * 30}ms`;
      const saved = r.savedAt ? new Date(r.savedAt).toLocaleDateString() : '—';
      tr.innerHTML = `
        <td>${escapeHtml(r.username || '')}</td>
        <td>${escapeHtml(r.state || '')}</td>
        <td class="num">${t.wpm ?? 0}</td>
        <td class="num">${t.accuracy ?? 0}%</td>
        <td class="num">${'★'.repeat(t.stars || 0) || '—'}</td>
        <td>${saved}</td>
      `;
      scoresBody.appendChild(tr);
    });
  }

  document.querySelectorAll('.scores-table th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (state.scoresSort.key === key) {
        state.scoresSort.dir = state.scoresSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        state.scoresSort = { key, dir: key === 'username' || key === 'state' ? 'asc' : 'desc' };
      }
      renderScores();
    });
  });

  scoreSearch.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadScores(scoreSearch.value.trim()), 250);
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  // ---------- Tab 3: Map ----------
  let mapLoaded = false;
  async function loadMap() {
    if (mapLoaded) return;
    mapLoaded = true;
    const container = document.getElementById('map-container');
    container.textContent = 'Loading map…';
    try {
      const res = await fetch('/api/generated-states');
      const data = await res.json();
      if (window.MapView) {
        await MapView.render(container, data.states || []);
      } else {
        container.textContent = 'Map failed to load.';
      }
    } catch (err) {
      container.textContent = `Map failed to load: ${err.message}`;
    }
  }
})();

/* Typing engine: keystroke diff, live WPM/accuracy/timer, next-scene gating. */
(function (global) {
  const NEXT_SCENE_MIN_ACCURACY = 90;   // percent
  const NEXT_SCENE_MIN_PROGRESS = 100;  // percent completed

  function createTyping(container, opts = {}) {
    const textEl = container.querySelector('.typing-text');
    const progressBar = container.querySelector('.typing-progress-bar');
    const nextBtn = container.querySelector('[data-action="next-scene"], [data-action="submit-scores"]');
    const hudWpm = container.querySelector('[data-hud="wpm"]');
    const hudAcc = container.querySelector('[data-hud="accuracy"]');
    const hudTime = container.querySelector('[data-hud="timer"]');

    let target = '';
    let typed = '';
    let started = false;
    let startTime = 0;         // performance.now() at (re)start, adjusted for pauses
    let accumulatedMs = 0;     // ms elapsed while paused, snapshot at pause
    let paused = false;
    let elapsedSec = 0;
    let correctChars = 0;
    let incorrectChars = 0;
    let totalKeystrokes = 0;
    let onComplete = null;
    let onProgress = null;
    let rafId = null;
    let finished = false;
    let active = false;

    function renderText() {
      const frag = document.createDocumentFragment();
      const t = target;
      for (let i = 0; i < t.length; i++) {
        const span = document.createElement('span');
        span.className = 'ch';
        span.textContent = t[i];
        if (i < typed.length) {
          span.classList.add(typed[i] === t[i] ? 'correct' : 'incorrect');
        } else if (i === typed.length) {
          span.classList.add('current');
        }
        frag.appendChild(span);
      }
      textEl.innerHTML = '';
      textEl.appendChild(frag);
    }

    function updateHud() {
      const now = performance.now();
      const rawMs = paused ? accumulatedMs : (started ? now - startTime : 0);
      elapsedSec = rawMs / 1000;
      const minutes = elapsedSec / 60;
      const wordsTyped = correctChars / 5;
      const wpm = minutes > 0 ? Math.round(wordsTyped / minutes) : 0;
      const attempted = correctChars + incorrectChars;
      const acc = attempted > 0 ? Math.round((correctChars / attempted) * 100) : 100;
      hudWpm.textContent = String(wpm);
      hudAcc.textContent = `${acc}%`;
      hudTime.textContent = `${elapsedSec.toFixed(1)}s`;
      const pct = target.length ? Math.min(100, (typed.length / target.length) * 100) : 0;
      progressBar.style.width = `${pct}%`;
      return { wpm, accuracy: acc, elapsedSec, pct };
    }

    function tick() {
      if (!started || finished) return;
      updateHud();
      rafId = requestAnimationFrame(tick);
    }

    function checkComplete() {
      const attempted = correctChars + incorrectChars;
      const acc = attempted > 0 ? Math.round((correctChars / attempted) * 100) : 100;
      const done = typed.length >= target.length;
      const canNext = done && (acc >= NEXT_SCENE_MIN_ACCURACY || attempted === 0);
      if (done && !finished) {
        finished = true;
        cancelAnimationFrame(rafId);
        const stats = updateHud();
        if (nextBtn) nextBtn.disabled = false;
        if (onComplete) onComplete(stats);
      } else if (nextBtn) {
        nextBtn.disabled = !canNext;
      }
      return canNext;
    }

    function handleKey(e) {
      if (!active || finished || paused) return;
      const key = e.key;
      if (key === 'Backspace') {
        e.preventDefault();
        if (typed.length > 0) {
          const removed = typed[typed.length - 1];
          const t = target[typed.length - 1];
          if (removed === t) correctChars = Math.max(0, correctChars - 1);
          else incorrectChars = Math.max(0, incorrectChars - 1);
          typed = typed.slice(0, -1);
          renderText();
          updateHud();
          checkComplete();
        }
        return;
      }
      if (key === 'Tab' || key === 'Escape' || (key.length !== 1 && key !== 'Enter')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();

      if (!started) {
        started = true;
        startTime = performance.now();
        tick();
      }

      const chIn = key === 'Enter' ? '\n' : key;
      if (typed.length >= target.length) return;
      const expected = target[typed.length];
      typed += chIn;
      totalKeystrokes++;
      if (chIn === expected) correctChars++;
      else incorrectChars++;

      renderText();
      const stats = updateHud();
      if (onProgress) onProgress(stats);
      checkComplete();
    }

    function focus() { textEl.focus(); }

    function reset(newTarget) {
      target = newTarget || '';
      typed = '';
      started = false;
      finished = false;
      paused = false;
      startTime = 0;
      accumulatedMs = 0;
      elapsedSec = 0;
      correctChars = 0;
      incorrectChars = 0;
      totalKeystrokes = 0;
      cancelAnimationFrame(rafId);
      if (nextBtn) nextBtn.disabled = true;
      hudWpm.textContent = '0';
      hudAcc.textContent = '100%';
      hudTime.textContent = '0.0s';
      progressBar.style.width = '0%';
      renderText();
    }

    function pause() {
      if (!started || finished || paused) return;
      paused = true;
      accumulatedMs = performance.now() - startTime;
      cancelAnimationFrame(rafId);
    }

    function resume() {
      if (!paused || finished) return;
      paused = false;
      startTime = performance.now() - accumulatedMs;
      tick();
      focus();
    }

    function isPaused() { return paused; }
    function hasStarted() { return started; }

    function stats() {
      const attempted = correctChars + incorrectChars;
      const acc = attempted > 0 ? Math.round((correctChars / attempted) * 100) : 100;
      const minutes = elapsedSec / 60;
      const wpm = minutes > 0 ? Math.round((correctChars / 5) / minutes) : 0;
      return { wpm, accuracy: acc, durationSec: Math.round(elapsedSec * 10) / 10, chars: target.length };
    }

    function activate() {
      active = true;
      document.addEventListener('keydown', handleKey);
      textEl.addEventListener('click', focus);
      setTimeout(focus, 100);
    }
    function deactivate() {
      active = false;
      document.removeEventListener('keydown', handleKey);
      textEl.removeEventListener('click', focus);
      cancelAnimationFrame(rafId);
    }

    return {
      reset,
      activate,
      deactivate,
      focus,
      stats,
      pause,
      resume,
      isPaused,
      hasStarted,
      setOnComplete(fn) { onComplete = fn; },
      setOnProgress(fn) { onProgress = fn; },
    };
  }

  global.TypingEngine = { create: createTyping };
})(window);

/**
 * Filename: panel.js
 * Purpose: DevTools panel UI — scan button, overlay toggles, issue list, messaging to content script.
 */
const TAB_KEY = 'a11yBarkerTabOrder';
const SR_KEY = 'a11yBarkerSrContent';
const HEADING_KEY = 'a11yBarkerHeading';
const ARIA_HIDDEN_KEY = 'a11yBarkerAriaHidden';
const ISSUES_PANEL_KEY = 'a11yBarkerIssuesPanel';
const AI_HEADING_KEY = 'a11yBarkerAiHeading';
const AI_ALT_KEY = 'a11yBarkerAiImgAlt';
const AI_MODEL_KEY = 'a11yBarkerAiModel';
/** Default: faster / cheaper. User can switch to Sonnet in the panel for higher accuracy. */
const AI_MODEL_HAIKU = 'claude-haiku-4-5-20251001';
const AI_MODEL_SONNET = 'claude-sonnet-4-5-20251022';
const AI_MODEL_DEFAULT = AI_MODEL_HAIKU;
const THEME_KEY = 'a11yBarkerTheme';

const AI_KEYS = [
  [AI_HEADING_KEY, 'Heading structure', 'heading'],
  [AI_ALT_KEY, 'Images alt', 'image'],
];

/** When storage has no value yet, AI toggles are off (opt-in). */
const AI_TOGGLE_DEFAULT = false;

/** Set when background reports a non-empty Anthropic key in config.js */
let _panelHasAiApiKey = false;

/** Effective default when storage has no `a11yBarkerAiModel` (from config.js via background). */
let _panelDefaultAiModel = AI_MODEL_DEFAULT;

/** Last successful AI response text per check; cleared on new sniff / clear / navigation. */
let _cachedAltAiRaw = null;
let _cachedHeadingAiRaw = null;

function clearAiResultCaches() {
  _cachedAltAiRaw = null;
  _cachedHeadingAiRaw = null;
}

/** Shows the Claude model radios only when at least one AI Check toggle is on. */
function updateAiModelRowVisibility() {
  if (_extInvalidated) return;
  const wrap = document.getElementById('ai-model-wrap');
  if (!wrap) return;
  if (!_panelHasAiApiKey) {
    wrap.style.display = 'none';
    return;
  }
  try {
    chrome.storage.local.get([AI_HEADING_KEY, AI_ALT_KEY], (data) => {
      if (_extInvalidated) return;
      const headingOn = data[AI_HEADING_KEY] !== undefined ? !!data[AI_HEADING_KEY] : AI_TOGGLE_DEFAULT;
      const imgAltOn = data[AI_ALT_KEY] !== undefined ? !!data[AI_ALT_KEY] : AI_TOGGLE_DEFAULT;
      wrap.style.display = headingOn || imgAltOn ? '' : 'none';
    });
  } catch (_) {
    _extInvalidated = true;
    showInvalidatedBanner();
  }
}

/** Shown below AI model when Anthropic rejects the API key (401/403 / auth error). */
function setAiKeyErrorBanner(message) {
  const el = document.getElementById('ai-key-error');
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

// ---------------------------------------------------------------------------
// Lucide icon SVG strings (inline — no CDN, required by Chrome extension CSP)
// ---------------------------------------------------------------------------
const ICON_PAW = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon" aria-hidden="true"><circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z"/><circle cx="4" cy="8" r="2"/></svg>';
const ICON_LOADER = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-spin" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
const ICON_X = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
const ICON_CLIPBOARD = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon" aria-hidden="true"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>';
const ICON_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
const ICON_SUN = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';
const ICON_MOON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
const ICON_TAB = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h13l-3-3"/><path d="M21 12H8l3 3"/><path d="M3 18h13l-3 3"/></svg>';
const ICON_SR = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 10s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="10" r="3"/></svg>';
const ICON_HEADING = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h16"/><path d="M6 4v16"/><path d="M18 4v16"/><path d="M6 4h12"/><path d="M6 20h12"/></svg>';
const ICON_HIDDEN = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';
const ICON_ISSUES = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
const ICON_IMAGE = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';

// ---------------------------------------------------------------------------
// Theme management
// ---------------------------------------------------------------------------

/**
 * Applies a theme ('light' or 'dark') to the panel document.
 * Toggles the `theme-dark` class on <html> and updates the toggle button.
 *
 * @param {'light'|'dark'} theme
 */
function applyTheme(theme) {
  const html = document.documentElement;
  const btn = document.getElementById('theme-toggle');
  if (theme === 'dark') {
    html.classList.add('theme-dark');
    if (btn) {
      btn.innerHTML = ICON_SUN;
      btn.setAttribute('aria-label', 'Switch to light theme');
      btn.title = 'Switch to light theme';
    }
  } else {
    html.classList.remove('theme-dark');
    if (btn) {
      btn.innerHTML = ICON_MOON;
      btn.setAttribute('aria-label', 'Switch to dark theme');
      btn.title = 'Switch to dark theme';
    }
  }
}

let _extInvalidated = false;
let _cachedTabId = null;

function showInvalidatedBanner() {
  const el = document.getElementById('invalidated-banner');
  if (el) el.style.display = '';
}

window.addEventListener('error', (e) => {
  if (e.message && e.message.includes('Extension context invalidated')) {
    _extInvalidated = true;
    showInvalidatedBanner();
  }
});

function extValid() {
  if (_extInvalidated) return false;
  try {
    return !!chrome?.runtime?.id;
  } catch (_) {
    _extInvalidated = true;
    showInvalidatedBanner();
    return false;
  }
}

const KEYS = [
  [TAB_KEY, 'Tab order', 'tab'],
  [SR_KEY, 'SR content ([role] name)', 'sr'],
  [HEADING_KEY, 'Heading structure', 'heading'],
  [ARIA_HIDDEN_KEY, 'aria-hidden', 'hidden'],
  [ISSUES_PANEL_KEY, 'Issues', 'issues'],
];

function iconForToggle(iconKey) {
  if (iconKey === 'tab') return ICON_TAB;
  if (iconKey === 'sr') return ICON_SR;
  if (iconKey === 'heading') return ICON_HEADING;
  if (iconKey === 'hidden') return ICON_HIDDEN;
  if (iconKey === 'issues') return ICON_ISSUES;
  if (iconKey === 'image') return ICON_IMAGE;
  return '';
}

function buildToggleInnerHtml(label, iconKey) {
  return `<span class="toggle-label-wrap"><span class="toggle-glyph">${iconForToggle(iconKey)}</span><span class="toggle-label">${escapeHtml(label)}</span></span><div class="pill"></div>`;
}

const WARN_RULES = new Set(['tabindex-positive', 'duplicate-landmark', 'image-large', 'heading-skip', 'link-ambiguous', 'focus-visible', 'label-in-name']);

function getTabId() {
  if (_extInvalidated) return null;
  try {
    const id = chrome?.devtools?.inspectedWindow?.tabId ?? null;
    if (id != null) _cachedTabId = id;
    return id ?? _cachedTabId;
  } catch (_) {
    _extInvalidated = true;
    showInvalidatedBanner();
    return _cachedTabId;
  }
}

function sendToPage(payload, cb) {
  if (_extInvalidated) return;
  try {
    chrome.runtime.sendMessage(
      { from: 'panel', tabId: getTabId(), payload },
      (res) => {
        if (_extInvalidated) return;
        try {
          if (chrome.runtime?.lastError) {
            if (String(chrome.runtime.lastError.message || '').includes('Extension context invalidated')) {
              _extInvalidated = true;
              showInvalidatedBanner();
            }
            cb?.({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          cb?.(res);
        } catch (_) {
          _extInvalidated = true;
          showInvalidatedBanner();
        }
      }
    );
  } catch (_) {
    _extInvalidated = true;
    showInvalidatedBanner();
  }
}

const MOOD_SRC = {
  happy:       'assets/dog/barker.svg',
  sad:         'assets/dog/barker-sad.svg',
  judgemental: 'assets/dog/barker-judgemental.svg',
};

function setMood(mood) {
  const img = document.getElementById('barkerSvg');
  if (!img) return;
  const statusEl = document.getElementById('statusText');
  img.src = MOOD_SRC[mood] ?? MOOD_SRC.judgemental;
  if (mood === 'happy') {
    statusEl.textContent = 'All clear — good boi page!';
    statusEl.className = 'header-status happy';
  } else if (mood === 'sad') {
    statusEl.textContent = 'Found some ruff issues';
    statusEl.className = 'header-status sad';
  } else {
    statusEl.textContent = 'Waiting to sniff…';
    statusEl.className = 'header-status judgemental';
  }
}

/**
 * Shows or hides the post-scan Heading result block based on API key, Heading toggle, and scan state.
 * @param {{ runAnalysis?: boolean }} [options] — if `runAnalysis`, runs Claude heading check when the section should be visible.
 */
function updateAiHeadingUiVisibility(options) {
  if (_extInvalidated) return;
  const runAnalysis = options?.runAnalysis === true;
  const scanBtn = document.getElementById('scan-btn');
  const scanned = scanBtn?.dataset.state === 'clear';
  const headingSection = document.getElementById('ai-heading-section');
  const resultEl = document.getElementById('heading-check-result');
  if (!headingSection) return;
  if (!_panelHasAiApiKey) {
    headingSection.style.display = 'none';
    if (resultEl) resultEl.textContent = '';
    return;
  }
  chrome.storage.local.get([AI_HEADING_KEY], (data) => {
    if (_extInvalidated) return;
    const headingOn = data[AI_HEADING_KEY] !== undefined ? !!data[AI_HEADING_KEY] : AI_TOGGLE_DEFAULT;
    if (!scanned || !headingOn) {
      headingSection.style.display = 'none';
      if (resultEl && !headingOn) resultEl.textContent = '';
      return;
    }
    headingSection.style.display = 'flex';
    if (runAnalysis) {
      if (_cachedHeadingAiRaw != null) {
        applyAiResultHtml(resultEl, _cachedHeadingAiRaw, 'heading');
      } else {
        runAiHeadingAnalysis();
      }
    }
  });
}

/**
 * Sends the page's headings to the background for Anthropic heading-structure review; updates `#heading-check-result`.
 */
function runAiHeadingAnalysis() {
  const resultEl = document.getElementById('heading-check-result');
  if (!resultEl || _extInvalidated) return;
  resultEl.textContent = 'Analysing…';
  sendToPage({ action: 'runHeadingCheck' }, (res) => {
    if (_extInvalidated) return;
    const inner = res?.response ?? res;
    if (inner?.ok) {
      setAiKeyErrorBanner(null);
      _cachedHeadingAiRaw = inner.result;
      applyAiResultHtml(resultEl, inner.result, 'heading');
    } else {
      if (inner?.aiAuthError) {
        setAiKeyErrorBanner(inner?.error || res?.error || 'API key rejected');
      }
      resultEl.textContent = inner?.error || res?.error || 'Analysis failed';
    }
  });
}

/**
 * Shows or hides the post-scan Images alt result block based on API key, Images alt toggle, and scan state.
 * @param {{ runAnalysis?: boolean }} [options] — if `runAnalysis`, runs Claude alt check when the section should be visible.
 */
function updateAiAltUiVisibility(options) {
  if (_extInvalidated) return;
  const runAnalysis = options?.runAnalysis === true;
  const scanBtn = document.getElementById('scan-btn');
  const scanned = scanBtn?.dataset.state === 'clear';
  const aiSection = document.getElementById('ai-section');
  const resultEl = document.getElementById('alt-check-result');
  if (!aiSection) return;
  if (!_panelHasAiApiKey) {
    aiSection.style.display = 'none';
    if (resultEl) resultEl.textContent = '';
    return;
  }
  chrome.storage.local.get([AI_ALT_KEY], (data) => {
    if (_extInvalidated) return;
    const imgAltOn = data[AI_ALT_KEY] !== undefined ? !!data[AI_ALT_KEY] : AI_TOGGLE_DEFAULT;
    if (!scanned || !imgAltOn) {
      aiSection.style.display = 'none';
      if (resultEl) {
        if (!imgAltOn) resultEl.textContent = '';
      }
      return;
    }
    aiSection.style.display = 'flex';
    if (runAnalysis) {
      if (_cachedAltAiRaw != null) {
        applyAiResultHtml(resultEl, _cachedAltAiRaw, 'alt');
      } else {
        runAiAltAnalysis();
      }
    }
  });
}

/**
 * Sends the page’s images to the background for Anthropic alt-text review; updates `#alt-check-result`.
 */
function runAiAltAnalysis() {
  const resultEl = document.getElementById('alt-check-result');
  if (!resultEl || _extInvalidated) return;
  resultEl.textContent = 'Analysing…';
  sendToPage({ action: 'runAltCheck' }, (res) => {
    if (_extInvalidated) return;
    const inner = res?.response ?? res;
    if (inner?.ok) {
      setAiKeyErrorBanner(null);
      _cachedAltAiRaw = inner.result;
      applyAiResultHtml(resultEl, inner.result, 'alt');
    } else {
      if (inner?.aiAuthError) {
        setAiKeyErrorBanner(inner?.error || res?.error || 'API key rejected');
      }
      resultEl.textContent = inner?.error || res?.error || 'Analysis failed';
    }
  });
}

function initAiModelRadios() {
  if (_extInvalidated) return;
  const haiku = document.getElementById('ai-model-haiku');
  const sonnet = document.getElementById('ai-model-sonnet');
  const group = document.getElementById('ai-model-radio-group');
  if (!haiku || !sonnet || !group) return;
  try {
    chrome.storage.local.get([AI_MODEL_KEY], (data) => {
      if (_extInvalidated) return;
      const v = data[AI_MODEL_KEY] !== undefined ? data[AI_MODEL_KEY] : _panelDefaultAiModel;
      if (v === AI_MODEL_SONNET) {
        sonnet.checked = true;
        haiku.checked = false;
      } else {
        haiku.checked = true;
        sonnet.checked = false;
      }
    });
  } catch (_) {
    _extInvalidated = true;
    showInvalidatedBanner();
    return;
  }
  if (group.dataset.bound === '1') return;
  group.dataset.bound = '1';
  group.addEventListener('change', (e) => {
    if (_extInvalidated) return;
    const t = e.target;
    if (t?.name !== 'ai-model') return;
    const next = t.value === AI_MODEL_SONNET ? AI_MODEL_SONNET : AI_MODEL_HAIKU;
    try {
      chrome.storage.local.set({ [AI_MODEL_KEY]: next });
    } catch (_) {
      _extInvalidated = true;
      showInvalidatedBanner();
    }
  });
}

function renderAiToggles() {
  if (_extInvalidated) return;
  const container = document.getElementById('ai-check-toggles');
  if (!container) return;
  try {
    chrome.storage.local.get(AI_KEYS.map(([k]) => k), (data) => {
      if (_extInvalidated) return;
      container.innerHTML = '';
      AI_KEYS.forEach(([key, label, iconKey]) => {
        const checked = data[key] !== undefined ? !!data[key] : AI_TOGGLE_DEFAULT;
        const row = document.createElement('div');
        row.className = 'toggle-row' + (checked ? ' on' : '');
        row.dataset.key = key;
        row.innerHTML = buildToggleInnerHtml(label, iconKey);
        row.addEventListener('click', () => {
          if (_extInvalidated) return;
          const next = !row.classList.contains('on');
          row.classList.toggle('on', next);
          try {
            chrome.storage.local.set({ [key]: next }, () => {
              if (_extInvalidated) return;
              updateAiModelRowVisibility();
              const scanned = document.getElementById('scan-btn')?.dataset.state === 'clear';
              if (key === AI_ALT_KEY && next && scanned) {
                updateAiAltUiVisibility({ runAnalysis: true });
              } else if (key === AI_HEADING_KEY && next && scanned) {
                updateAiHeadingUiVisibility({ runAnalysis: true });
              } else {
                updateAiAltUiVisibility();
                updateAiHeadingUiVisibility();
              }
            });
          } catch (_) {
            _extInvalidated = true;
            showInvalidatedBanner();
            return;
          }
        });
        container.appendChild(row);
      });
      updateAiModelRowVisibility();
    });
  } catch (_) {
    _extInvalidated = true;
    showInvalidatedBanner();
  }
}

function refreshAiCheckSection() {
  if (_extInvalidated) return;
  try {
    chrome.runtime.sendMessage(
      { from: 'panel', payload: { action: 'getAiConfigStatus' } },
      (res) => {
        if (_extInvalidated) return;
        const section = document.getElementById('ai-check-section');
        if (chrome.runtime?.lastError || !section) {
          _panelHasAiApiKey = false;
          if (section) section.style.display = 'none';
          setAiKeyErrorBanner(null);
          updateAiAltUiVisibility();
          updateAiHeadingUiVisibility();
          return;
        }
        const hasConfig = !!(res?.ok && res?.hasConfig);
        const hasApiKey = !!(res?.ok && res?.hasApiKey);
        _panelHasAiApiKey = hasApiKey;
        if (res?.defaultModel === AI_MODEL_SONNET) {
          _panelDefaultAiModel = AI_MODEL_SONNET;
        } else {
          _panelDefaultAiModel = AI_MODEL_HAIKU;
        }
        if (hasConfig && hasApiKey) {
          section.style.display = '';
          renderAiToggles();
          initAiModelRadios();
        } else {
          section.style.display = 'none';
          setAiKeyErrorBanner(null);
        }
        updateAiAltUiVisibility();
        updateAiHeadingUiVisibility();
      }
    );
  } catch (_) {
    _extInvalidated = true;
    showInvalidatedBanner();
  }
}

function renderToggles() {
  if (_extInvalidated) return;
  try {
    chrome.storage.local.get(KEYS.map(([k]) => k), (data) => {
      const container = document.getElementById('toggles');
      container.innerHTML = '';
      KEYS.forEach(([key, label, iconKey]) => {
        const checked = data[key] !== undefined ? !!data[key] : true;
        const row = document.createElement('div');
        row.className = 'toggle-row' + (checked ? ' on' : '');
        row.dataset.key = key;
        row.innerHTML = buildToggleInnerHtml(label, iconKey);
        row.addEventListener('click', () => {
          if (_extInvalidated) return;
          const next = !row.classList.contains('on');
          row.classList.toggle('on', next);
          try {
            chrome.storage.local.set({ [key]: next });
          } catch (_) {
            _extInvalidated = true;
            showInvalidatedBanner();
            return;
          }
          sendToPage({ action: 'setFlag', key, val: next });
        });
        container.appendChild(row);
      });
      updateIssueListVisibility();
    });
  } catch (_) {
    _extInvalidated = true;
    showInvalidatedBanner();
  }
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

/**
 * Parses AI output expected to be JSON only; strips optional ``` fences; tries `{`…`}` slice if needed.
 * @param {string|null|undefined} raw
 * @returns {{ ok: true, value: object } | { ok: false, message: string, raw: string }}
 */
function parseAiJsonRaw(raw) {
  if (raw == null || String(raw).trim() === '') {
    return { ok: false, message: 'No text returned from the model.', raw: '' };
  }
  let s = String(raw).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();

  function tryParseObj(str) {
    try {
      const value = JSON.parse(str);
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) return value;
      return null;
    } catch (_) {
      return null;
    }
  }

  let v = tryParseObj(s);
  if (!v) {
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start !== -1 && end > start) v = tryParseObj(s.slice(start, end + 1));
  }
  if (!v) return { ok: false, message: 'Invalid JSON from model.', raw: s };
  return { ok: true, value: v };
}

function altStatusClass(status) {
  const u = String(status || '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (u === 'GOOD') return 'ai-st-good';
  if (u === 'TOO GENERIC') return 'ai-st-generic';
  if (u === 'MISSING') return 'ai-st-missing';
  if (u === 'DECORATIVE OK') return 'ai-st-dec-ok';
  if (u === 'DECORATIVE WRONG') return 'ai-st-dec-wrong';
  return 'ai-st-default';
}

function buildHeadingReviewDom(obj) {
  const root = document.createElement('div');
  const issues = Array.isArray(obj.issues) ? obj.issues : [];
  const hasIssues = issues.length > 0;
  const issuesBlock = document.createElement('div');
  issuesBlock.className = 'ai-result-section';
  if (!hasIssues) {
    const none = document.createElement('p');
    none.className = 'ai-result-none';
    none.textContent = 'No issues reported.';
    issuesBlock.appendChild(none);
  } else {
    const subHead = document.createElement('div');
    subHead.className = 'ai-result-subhead';
    subHead.textContent = 'Issues';
    issuesBlock.appendChild(subHead);
    issues.forEach((item, i) => {
      const headingIdx =
        item.headingIndex != null &&
        String(item.headingIndex).trim() !== '' &&
        !Number.isNaN(Number(item.headingIndex))
          ? Math.floor(Number(item.headingIndex))
          : i + 1;
      const row = document.createElement('div');
      row.className = 'ai-heading-issue-row ai-heading-issue-row--clickable';
      row.setAttribute('role', 'button');
      row.tabIndex = 0;
      row.title = 'Show heading #' + headingIdx + ' on the page';
      const head = document.createElement('div');
      head.className = 'ai-heading-issue-row-head';
      const idx = document.createElement('span');
      idx.className = 'ai-heading-issue-index';
      idx.textContent = '#' + headingIdx;
      const wcag = document.createElement('span');
      wcag.className = 'ai-wcag-pill';
      const wc = item.wcag != null && String(item.wcag).trim() !== '' ? String(item.wcag).trim() : '—';
      wcag.textContent = 'WCAG ' + wc;
      head.appendChild(idx);
      head.appendChild(wcag);
      const desc = document.createElement('div');
      desc.className = 'ai-heading-issue-desc';
      desc.textContent = item.description != null ? String(item.description) : '';
      row.appendChild(head);
      row.appendChild(desc);
      function goHighlight() {
        sendToPage({ action: 'highlightHeadingIndex', headingIndex: headingIdx });
      }
      row.addEventListener('click', goHighlight);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          goHighlight();
        }
      });
      issuesBlock.appendChild(row);
    });
  }
  root.appendChild(issuesBlock);

  const recText = obj.recommendation != null ? String(obj.recommendation) : '';
  if (hasIssues || recText.trim()) {
    const recBlock = document.createElement('div');
    recBlock.className = 'ai-result-section';
    if (hasIssues) {
      const subHead2 = document.createElement('div');
      subHead2.className = 'ai-result-subhead';
      subHead2.textContent = 'Recommendation';
      recBlock.appendChild(subHead2);
    }
    const recP = document.createElement('p');
    recP.className = 'ai-recommendation-text';
    recP.textContent = recText;
    recBlock.appendChild(recP);
    root.appendChild(recBlock);
  }
  return root;
}

function buildAltReviewDom(obj) {
  const root = document.createElement('div');
  const images = Array.isArray(obj.images) ? obj.images : [];
  if (images.length === 0) {
    const p = document.createElement('p');
    p.className = 'ai-result-none';
    p.textContent = 'No image entries in response.';
    root.appendChild(p);
    return root;
  }
  images.forEach((img, i) => {
    // 1-based index matching collectImageData / listAltCheckImages order (not the model index field).
    const displayIndex = i + 1;
    const row = document.createElement('div');
    row.className = 'ai-img-row ai-img-row--clickable';
    row.setAttribute('role', 'button');
    row.tabIndex = 0;
    row.title = 'Show image #' + displayIndex + ' on the page';
    const head = document.createElement('div');
    head.className = 'ai-img-row-head';
    const idx = document.createElement('span');
    idx.className = 'ai-img-index';
    idx.textContent = '#' + displayIndex;
    const pill = document.createElement('span');
    pill.className = 'ai-status-pill ' + altStatusClass(img.status);
    pill.textContent = img.status != null ? String(img.status) : '—';
    head.appendChild(idx);
    head.appendChild(pill);
    const reason = document.createElement('div');
    reason.className = 'ai-img-reason';
    reason.textContent = img.reason != null ? String(img.reason) : '';
    row.appendChild(head);
    row.appendChild(reason);
    function goHighlight() {
      sendToPage({ action: 'highlightAltImage', imageIndex: displayIndex });
    }
    row.addEventListener('click', goHighlight);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        goHighlight();
      }
    });
    root.appendChild(row);
  });
  return root;
}

/**
 * Renders parsed AI JSON into readable HTML inside `el` (all text nodes — safe for model output).
 * @param {HTMLElement} el
 * @param {string|null|undefined} raw
 * @param {'heading'|'alt'} kind
 */
function applyAiResultHtml(el, raw, kind) {
  el.textContent = '';
  const parsed = parseAiJsonRaw(raw);
  if (!parsed.ok) {
    const pre = document.createElement('pre');
    pre.className = 'ai-result-error';
    pre.textContent = (parsed.message || 'Parse error') + (parsed.raw ? '\n\n' + parsed.raw : '');
    el.appendChild(pre);
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'ai-result-html';
  wrap.appendChild(kind === 'heading' ? buildHeadingReviewDom(parsed.value) : buildAltReviewDom(parsed.value));
  el.appendChild(wrap);
}

document.getElementById('export-btn').addEventListener('click', () => {
  if (_extInvalidated) return;
  const btn = document.getElementById('export-btn');
  sendToPage({ action: 'getExportSnapshot' }, (res) => {
    const snapshot = res?.response;
    if (!snapshot || snapshot.error) return;
    const json = JSON.stringify(snapshot, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      btn.innerHTML = ICON_CHECK + 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.innerHTML = ICON_CLIPBOARD + 'Copy JSON';
        btn.classList.remove('copied');
      }, 1500);
    }).catch(() => { });
  });
});

document.getElementById('scan-btn').addEventListener('click', () => {
  if (_extInvalidated) return;
  const btn = document.getElementById('scan-btn');
  if (btn.dataset.state !== 'clear') {
    clearAiResultCaches();
    setAiKeyErrorBanner(null);
    btn.innerHTML = ICON_LOADER + 'Sniffing…';
    btn.dataset.state = 'scanning';
    btn.classList.add('scanning');
    setMood('judgemental');
    let answered = false;
    const done = (res) => {
      if (answered) return;
      answered = true;
      clearTimeout(timeoutId);
      btn.innerHTML = ICON_X + 'Clear';
      btn.dataset.state = 'clear';
      btn.classList.remove('scanning');
      const contentRes = res?.response ?? res;
      if (!contentRes?.ok && (contentRes?.error || res?.error)) {
        alert(contentRes?.error || res?.error);
      }
      chrome.storage.local.get([AI_HEADING_KEY, AI_ALT_KEY], (data) => {
        if (_extInvalidated) return;
        const headingOn =
          data[AI_HEADING_KEY] !== undefined ? !!data[AI_HEADING_KEY] : AI_TOGGLE_DEFAULT;
        const imgAltOn = data[AI_ALT_KEY] !== undefined ? !!data[AI_ALT_KEY] : AI_TOGGLE_DEFAULT;
        updateAiAltUiVisibility({ runAnalysis: imgAltOn });
        updateAiHeadingUiVisibility({ runAnalysis: headingOn });
      });
    };
    const timeoutId = setTimeout(() => {
      done({ ok: false, error: 'Scan timed out. Try refreshing the page and open DevTools before the page loads.' });
    }, 15000);
    sendToPage({ action: 'scan' }, done);
  } else {
    sendToPage({ action: 'clear' }, (res) => {
      if (res?.ok) {
        btn.innerHTML = ICON_PAW + 'Sniff page';
        btn.dataset.state = '';
        setMood('judgemental');
        const altResult = document.getElementById('alt-check-result');
        if (altResult) altResult.textContent = '';
        const headingResult = document.getElementById('heading-check-result');
        if (headingResult) headingResult.textContent = '';
        clearAiResultCaches();
        setAiKeyErrorBanner(null);
        updateAiAltUiVisibility();
        updateAiHeadingUiVisibility();
      }
    });
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (_extInvalidated) return;
  try {
    if (msg.source === 'content' && msg.action === 'issues') {
      _lastIssues = msg.issues || [];
      if (isIssuesToggledOn()) {
        renderIssues(_lastIssues);
      } else {
        updateIssueListVisibility();
      }
    }
  } catch (_) {
    _extInvalidated = true;
    showInvalidatedBanner();
  }
});

function isIssuesToggledOn() {
  return document.querySelector(`.toggle-row[data-key="${ISSUES_PANEL_KEY}"]`)?.classList.contains('on');
}

function isScanned() {
  return document.getElementById('scan-btn')?.dataset.state === 'clear';
}

let _lastIssuesCount = 0;
let _lastIssues = [];

/**
 * Normalizes issues to grouped format. Supports backward compat with flat arrays (single-issue-per-element).
 * Content script sends [{ issues: [{rule, message}, ...] }, ...]; legacy format is [{rule, message}, ...].
 * @param {Array} issues - Flat or grouped issue array
 * @returns {Array<{issues: Array}>} Always returns array of groups
 */
function normalizeToGroups(issues) {
  if (!issues || issues.length === 0) return [];
  const first = issues[0];
  if (first && Array.isArray(first.issues)) return issues;
  return issues.map((item) => ({ issues: [item] }));
}

/**
 * Updates issue list visibility based on Issues toggle and _lastIssues. Three states:
 * 1) Toggle OFF: hide header and list; show empty only if no issues
 * 2) Toggle ON + issues: render issues
 * 3) Toggle ON + no issues: show "Click Sniff to find issues"
 */
function updateIssueListVisibility() {
  const empty = document.getElementById('issue-empty');
  const list = document.getElementById('issue-list');
  const header = document.getElementById('issues-header');
  if (!isIssuesToggledOn()) {
    header.style.display = 'none';
    list.style.display = 'none';
    if (_lastIssues.length === 0) {
      empty.style.display = '';
      empty.textContent = 'Click Sniff to find issues';
    } else {
      empty.style.display = 'none';
    }
  } else if (_lastIssues.length > 0) {
    renderIssues(_lastIssues);
  } else {
    header.style.display = 'none';
    empty.style.display = '';
    empty.textContent = 'Click Sniff to find issues';
    list.style.display = 'none';
  }
}

/**
 * Creates a single issue row DOM element for a grouped issue. Used by renderIssues.
 * @param {Object} group - { issues: [{rule, message}, ...] }
 * @param {number} groupIndex - Index for highlight action
 * @returns {HTMLDivElement}
 */
function createIssueRow(group, groupIndex) {
  const RULES = window.A11Y_BARKER_RULES || {};
  const items = group.issues || [group];
  const tags = [];
  const messages = [];
  let hasWarn = false;
  let firstHelpUrl = null;
  let firstTitle = '';
  items.forEach((item) => {
    const isWarn = WARN_RULES.has(item.rule);
    if (isWarn) hasWarn = true;
    const meta = RULES[item.rule];
    const displayLabel = meta?.label || item.rule;
    const wcagLabel = meta?.wcag ? `${meta.wcag} ${meta.level}` : (meta?.level ? meta.level : '');
    tags.push(wcagLabel ? `${displayLabel} (${wcagLabel})` : displayLabel);
    messages.push(item.message);
    if (meta?.helpUrl && !firstHelpUrl) firstHelpUrl = meta.helpUrl;
    if (meta?.description && !firstTitle) firstTitle = meta.description;
  });
  const tagContent = tags.join(', ');
  const tagEl = document.createElement(firstHelpUrl ? 'a' : 'span');
  tagEl.className = `issue-tag ${hasWarn ? 'warn' : ''}`;
  tagEl.textContent = tagContent.trim() || 'issue';
  if (firstHelpUrl) {
    tagEl.href = firstHelpUrl;
    tagEl.target = '_blank';
    tagEl.rel = 'noopener';
    tagEl.addEventListener('click', (e) => e.stopPropagation());
  }
  if (firstTitle) tagEl.title = firstTitle;

  const row = document.createElement('div');
  row.className = 'issue-item';
  row.setAttribute('role', 'button');
  row.tabIndex = 0;
  row.appendChild(tagEl);
  const msgSpan = document.createElement('span');
  msgSpan.className = 'issue-msg';
  msgSpan.textContent = messages.join('; ');
  row.appendChild(msgSpan);
  row.addEventListener('click', (e) => {
    if (tagEl.contains(e.target)) return;
    sendToPage({ action: 'highlight', groupIndex });
  });
  row.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      if (!tagEl.contains(document.activeElement)) {
        e.preventDefault();
        sendToPage({ action: 'highlight', groupIndex });
      }
    }
  });
  return row;
}

/**
 * Renders the issue list. Expects grouped format: [{ issues: [{rule, message}, ...] }, ...].
 * Flat format is normalized via normalizeToGroups. Sets mood and shows empty state or list.
 * @param {Array} issues - Grouped or flat issue array
 */
function renderIssues(issues) {
  const groups = normalizeToGroups(issues);
  _lastIssuesCount = groups.length;
  const empty = document.getElementById('issue-empty');
  const list = document.getElementById('issue-list');
  const header = document.getElementById('issues-header');
  const countEl = document.getElementById('issue-count');
  if (groups.length === 0) {
    header.style.display = 'none';
    empty.style.display = '';
    empty.textContent = 'No issues — Barker approves!';
    list.style.display = 'none';
    list.innerHTML = '';
    setMood('happy');
  } else {
    header.style.display = 'flex';
    countEl.textContent = String(groups.length);
    countEl.className = 'issue-count';
    empty.style.display = 'none';
    list.style.display = 'flex';
    list.innerHTML = '';
    groups.forEach((group, groupIndex) => {
      list.appendChild(createIssueRow(group, groupIndex));
    });
    setMood('sad');
  }
}

chrome.storage.onChanged.addListener((changes) => {
  if (_extInvalidated) return;
  try {
    if (changes[AI_HEADING_KEY] || changes[AI_ALT_KEY]) {
      renderAiToggles();
      updateAiAltUiVisibility();
      updateAiHeadingUiVisibility();
    }
    if (changes[AI_MODEL_KEY]) {
      initAiModelRadios();
      clearAiResultCaches();
      updateAiAltUiVisibility({ runAnalysis: true });
      updateAiHeadingUiVisibility({ runAnalysis: true });
    }
    if (changes[TAB_KEY] || changes[SR_KEY] || changes[HEADING_KEY] || changes[ARIA_HIDDEN_KEY] || changes[ISSUES_PANEL_KEY]) {
      renderToggles();
      if (changes[ISSUES_PANEL_KEY]) {
        updateIssueListVisibility();
      }
    }
  } catch (_) {
    _extInvalidated = true;
    showInvalidatedBanner();
  }
});

function onPanelClose() {
  if (_extInvalidated) return;
  try {
    const tabId = getTabId();
    chrome.runtime.sendMessage({
      from: 'panel',
      tabId,
      payload: { action: 'clear' },
    });
  } catch (_) { }
}

/**
 * Re-initializes the panel when the inspected tab navigates (chrome.tabs.onUpdated).
 * Resets scan button, mood, issue list UI, and sends clear to content script.
 */
function reinitPanel() {
  if (_extInvalidated) return;
  const scanBtn = document.getElementById('scan-btn');
  if (scanBtn) {
    scanBtn.innerHTML = ICON_PAW + 'Sniff page';
    scanBtn.dataset.state = '';
    scanBtn.classList.remove('scanning');
  }
  setMood('judgemental');
  const empty = document.getElementById('issue-empty');
  const list = document.getElementById('issue-list');
  const header = document.getElementById('issues-header');
  if (header) header.style.display = 'none';
  if (empty) {
    empty.style.display = '';
    empty.textContent = 'Click Sniff to find issues';
  }
  if (list) {
    list.style.display = 'none';
    list.innerHTML = '';
  }
  const altResult = document.getElementById('alt-check-result');
  if (altResult) altResult.textContent = '';
  const headingResult = document.getElementById('heading-check-result');
  if (headingResult) headingResult.textContent = '';
  clearAiResultCaches();
  setAiKeyErrorBanner(null);
  updateAiAltUiVisibility();
  updateAiHeadingUiVisibility();
  sendToPage({ action: 'clear' });
}

chrome.tabs.onUpdated?.addListener((tabId, changeInfo) => {
  if (_extInvalidated) return;
  const inspected = getTabId();
  if (inspected == null || tabId !== inspected) return;
  const navigated = changeInfo.status === 'loading' || changeInfo.url;
  if (navigated) reinitPanel();
});

window.addEventListener('beforeunload', onPanelClose);
window.addEventListener('pagehide', onPanelClose);
window.addEventListener('unload', onPanelClose);

renderToggles();
refreshAiCheckSection();
setMood('judgemental');

// Initialize button content
document.getElementById('scan-btn').innerHTML = ICON_PAW + 'Sniff page';
document.getElementById('export-btn').innerHTML = ICON_CLIPBOARD + 'Copy JSON';

// Initialize theme from storage (default: light)
chrome.storage.local.get(THEME_KEY, (data) => {
  applyTheme(data[THEME_KEY] || 'light');
});

// Theme toggle button
document.getElementById('theme-toggle')?.addEventListener('click', () => {
  if (_extInvalidated) return;
  const isDark = document.documentElement.classList.contains('theme-dark');
  const next = isDark ? 'light' : 'dark';
  applyTheme(next);
  try {
    chrome.storage.local.set({ [THEME_KEY]: next });
  } catch (_) { }
});

/**
 * Filename: panel.js
 * Purpose: DevTools panel UI — scan button, overlay toggles, issue list, messaging to content script.
 */
const TAB_KEY = 'a11yBarkerTabOrder';
const SR_KEY = 'a11yBarkerSrContent';
const HEADING_KEY = 'a11yBarkerHeading';
const ARIA_HIDDEN_KEY = 'a11yBarkerAriaHidden';
const ISSUES_PANEL_KEY = 'a11yBarkerIssuesPanel';
const THEME_KEY = 'a11yBarkerTheme';

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
  [TAB_KEY, 'Tab order'],
  [SR_KEY, 'SR content ([role] name)'],
  [HEADING_KEY, 'Heading structure'],
  [ARIA_HIDDEN_KEY, 'aria-hidden'],
  [ISSUES_PANEL_KEY, 'Issues'],
];

const WARN_RULES = new Set(['tabindex-positive', 'duplicate-landmark', 'image-large', 'heading-skip', 'link-ambiguous', 'focus-visible']);

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

function renderToggles() {
  if (_extInvalidated) return;
  try {
    chrome.storage.local.get(KEYS.map(([k]) => k), (data) => {
      const container = document.getElementById('toggles');
      container.innerHTML = '';
      KEYS.forEach(([key, label]) => {
        const checked = data[key] !== undefined ? !!data[key] : true;
        const row = document.createElement('div');
        row.className = 'toggle-row' + (checked ? ' on' : '');
        row.dataset.key = key;
        row.innerHTML = `<span class="toggle-label">${escapeHtml(label)}</span><div class="pill"></div>`;
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

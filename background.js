try { importScripts('config.js'); } catch (_) {}

const DEFAULT_AI_MODEL = 'claude-haiku-4-5-20251001';
const ALLOWED_AI_MODELS = new Set([
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-5-20251022',
]);

function normalizeAiModel(m) {
  if (typeof m === 'string' && ALLOWED_AI_MODELS.has(m)) return m;
  return DEFAULT_AI_MODEL;
}

/** Payload wins; then `config.js` `model`; then Haiku. */
function resolveAiModel(payload) {
  return normalizeAiModel(payload?.model ?? globalThis.A11Y_BARKER_CONFIG?.model);
}

function getDefaultModelFromConfig() {
  return normalizeAiModel(globalThis.A11Y_BARKER_CONFIG?.model);
}

const DEFAULT_MAX_TOKENS = 1024;
const MAX_TOKENS_MIN = 1;
const MAX_TOKENS_MAX = 8192;

/** From `config.js` `maxTokens`; clamped to a safe range. */
function resolveMaxTokens() {
  const raw = globalThis.A11Y_BARKER_CONFIG?.maxTokens;
  if (raw === undefined || raw === null) return DEFAULT_MAX_TOKENS;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_MAX_TOKENS;
  const i = Math.round(n);
  return Math.min(MAX_TOKENS_MAX, Math.max(MAX_TOKENS_MIN, i));
}

const CONTENT_SCRIPTS = [
  'overlay/index.js',
  'overlay/coordinator.js',
  'analyzer/tabOrder.js',
  'analyzer/srContent.js',
  'analyzer/staticRules.js',
  'analyzer/colorContrast.js',
  'analyzer/imageHealth.js',
  'overlay/TabOverlay.js',
  'overlay/HeadingOverlay.js',
  'overlay/AriaHiddenOverlay.js',
  'rules-registry.js',
  'overlay/HeadingTreePanel.js',
  'utils/dom.js',
  'ai/altChecker.js',
  'ai/headingChecker.js',
  'content.js',
];

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.from !== 'panel') return false;

  if (msg.payload?.action === 'getAiConfigStatus') {
    const key = globalThis.A11Y_BARKER_CONFIG?.apiKey;
    const hasApiKey = typeof key === 'string' && key.trim().length > 0;
    sendResponse({ ok: true, hasApiKey, defaultModel: getDefaultModelFromConfig() });
    return false;
  }

  if (msg.from === 'panel' && (msg.payload?.action === 'aiAltCheck' || msg.payload?.action === 'aiHeadingCheck')) {
    const apiKey = globalThis.A11Y_BARKER_CONFIG?.apiKey;
    if (!apiKey) {
      sendResponse({ ok: false, error: 'No API key in config.js' });
      return true;
    }
    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        // Required for browser/extension contexts so Anthropic allows the request (BYO key).
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: resolveAiModel(msg.payload),
        max_tokens: resolveMaxTokens(),
        messages: [{ role: 'user', content: msg.payload.prompt }],
      }),
    })
      .then(async (r) => {
        let data = {};
        try {
          data = await r.json();
        } catch (_) { /* non-JSON body */ }
        const text = data.content?.[0]?.text;
        if (text != null && text !== '') {
          sendResponse({ ok: true, result: text });
          return;
        }
        const errMsg = data.error?.message || 'API returned no content';
        const errType = data.error?.type;
        const aiAuthError =
          r.status === 401 ||
          r.status === 403 ||
          errType === 'authentication_error' ||
          (typeof errType === 'string' && errType.toLowerCase().includes('authentication'));
        sendResponse({ ok: false, error: errMsg, aiAuthError });
      })
      .catch((e) => sendResponse({ ok: false, error: e.message, aiAuthError: false }));
    return true;
  }

  function resolveTabId(cb) {
    const tid = msg.tabId;
    if (tid != null && typeof tid === 'number') {
      cb(tid);
      return;
    }
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      cb(tabs?.[0]?.id ?? null);
    });
  }

  let responded = false;
  const safeSend = (r) => {
    if (responded) return;
    responded = true;
    try { sendResponse(r); } catch (_) {}
  };

  resolveTabId((tabId) => {
    if (!tabId) {
      safeSend({ ok: false, error: 'No tab. Focus the webpage, then try again.' });
      return;
    }
    chrome.tabs.sendMessage(tabId, msg.payload, (r) => {
      if (!chrome.runtime.lastError) {
        safeSend({ ok: true, response: r });
        return;
      }
      chrome.scripting.executeScript(
        { target: { tabId }, files: CONTENT_SCRIPTS },
        () => {
          if (chrome.runtime.lastError) {
            safeSend({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          chrome.tabs.sendMessage(tabId, msg.payload, (r2) => {
            safeSend({ ok: !chrome.runtime.lastError, response: r2, error: chrome.runtime.lastError?.message });
          });
        }
      );
    });
  });
  return true;
});

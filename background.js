let HAS_LOCAL_CONFIG = false;
let CONFIG_READY = Promise.resolve();

function loadOptionalConfig() {
  try {
    importScripts('config.js');
    HAS_LOCAL_CONFIG = true;
  } catch (_) {
    HAS_LOCAL_CONFIG = false;
  }
  CONFIG_READY = Promise.resolve();
}

loadOptionalConfig();

const DEFAULT_AI_MODEL = 'claude-haiku-4-5-20251001';

function getDefaultModelFromConfig() {
  const m = globalThis.A11Y_BARKER_CONFIG?.model;
  return typeof m === 'string' && m.trim() ? m.trim() : DEFAULT_AI_MODEL;
}

function resolveAiModel() {
  return getDefaultModelFromConfig();
}

const DEFAULT_IMAGE_SIZE = 500;
const IMAGE_SIZE_MIN = 100;
const IMAGE_SIZE_MAX = 1568;

function getImageSize() {
  const raw = globalThis.A11Y_BARKER_CONFIG?.imageSize;
  if (raw === undefined || raw === null) return DEFAULT_IMAGE_SIZE;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_IMAGE_SIZE;
  return Math.min(IMAGE_SIZE_MAX, Math.max(IMAGE_SIZE_MIN, Math.round(n)));
}

/**
 * Fetch an image URL and return a base64 JPEG string, resized so the long edge
 * does not exceed maxPx. Uses OffscreenCanvas (available in service workers).
 * @param {string} url
 * @param {number} maxPx
 * @returns {Promise<string>} base64-encoded JPEG
 */
async function fetchAndResizeImage(url, maxPx) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  const scale = Math.min(1, maxPx / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const resized = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
  const buf = await resized.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
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

/**
 * Build Claude vision content blocks for alt text review.
 * @param {Array<{src:string, alt:string|null, context:string}>} images
 * @param {Record<string,string>} base64Map  src → base64 JPEG string
 * @returns {Array<object>}
 */
function buildVisionContent(images, base64Map) {
  const schema = '{\n  "images": [\n    {\n      "index": 1,\n      "status": "GOOD | TOO GENERIC | MISSING | DECORATIVE OK | DECORATIVE WRONG",\n      "reason": "brief reason"\n    }\n  ]\n}';
  const intro = [
    'You are an accessibility expert reviewing image alternative text on a web page.',
    'For each image you will see the alt metadata AND the actual image.',
    'Judge whether the alt text (or lack of it) accurately and specifically describes what the image shows.',
    '',
    'Respond with ONLY a single JSON object and nothing else.',
    '- No markdown, no code fences, no commentary before or after the JSON.',
    '- Include exactly one object in "images" per input image, same order, with "index" 1..N.',
    '- "status" must be exactly one of: GOOD, TOO GENERIC, MISSING, DECORATIVE OK, DECORATIVE WRONG',
    '  - MISSING: no alt attribute.',
    '  - DECORATIVE OK / DECORATIVE WRONG: empty alt — OK if truly decorative, WRONG if the image conveys meaning.',
    '  - GOOD: alt is specific, accurate, and matches the actual image content.',
    '  - TOO GENERIC: alt exists but is vague or does not match the image (e.g. wrong subject, wrong breed, "image", filename only).',
    '- "reason" is a short string for each image.',
    '',
    'Exact shape:',
    schema,
    '',
    'Images:',
  ].join('\n');

  const blocks = [{ type: 'text', text: intro }];
  images.forEach((img, i) => {
    const altDesc = img.alt === null ? '(alt attribute missing)' : img.alt === '' ? '(decorative: empty alt)' : JSON.stringify(img.alt);
    const ctx = img.context ? `Context: ${img.context}` : 'Context: (none)';
    blocks.push({ type: 'text', text: `Image ${i + 1}:\n  alt: ${altDesc}\n  ${ctx}` });
    const b64 = base64Map[img.src];
    if (b64) blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } });
  });
  return blocks;
}

function isNetworkFetchError(err) {
  if (!err) return false;
  if (err instanceof TypeError) return true;
  const msg = String(err.message || err);
  return /failed to fetch|network|networkerror|load failed|aborted|timeout/i.test(msg);
}

function classifyAnthropicFailure(status, data, parseFailed) {
  const errType = data?.error?.type;
  const errMsg = data?.error?.message;
  const aiAuthError =
    status === 401 ||
    status === 403 ||
    errType === 'authentication_error' ||
    (typeof errType === 'string' && errType.toLowerCase().includes('authentication'));

  if (aiAuthError) {
    return {
      ok: false,
      error: errMsg || 'Invalid API key. Check config.js and your Anthropic key.',
      errorKind: 'auth',
      aiAuthError: true,
    };
  }

  if (parseFailed) {
    return {
      ok: false,
      error: 'Could not parse API response (invalid JSON).',
      errorKind: 'parse',
      aiAuthError: false,
    };
  }

  if (status === 429) {
    return {
      ok: false,
      error: errMsg || 'Rate limit exceeded. Wait a moment and try again.',
      errorKind: 'api',
      aiAuthError: false,
    };
  }

  if (status >= 500) {
    return {
      ok: false,
      error: errMsg || `Anthropic server error (${status}). Try again later.`,
      errorKind: 'api',
      aiAuthError: false,
    };
  }

  return {
    ok: false,
    error: errMsg || 'API returned no content',
    errorKind: 'api',
    aiAuthError: false,
  };
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
  'utils/tokenEstimate.js',
  'ai/altChecker.js',
  'ai/headingChecker.js',
  'content.js',
];

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.from !== 'panel') return false;

  if (msg.payload?.action === 'getAiConfigStatus') {
    CONFIG_READY.then(() => {
      const key = globalThis.A11Y_BARKER_CONFIG?.apiKey;
      const hasApiKey = typeof key === 'string' && key.trim().length > 0;
      sendResponse({
        ok: true,
        hasConfig: HAS_LOCAL_CONFIG,
        hasApiKey,
        defaultModel: getDefaultModelFromConfig(),
        imageSize: getImageSize(),
      });
    });
    return true;
  }

  if (msg.from === 'panel' && (msg.payload?.action === 'aiAltCheck' || msg.payload?.action === 'aiHeadingCheck')) {
    CONFIG_READY.then(async () => {
      const apiKey = globalThis.A11Y_BARKER_CONFIG?.apiKey;
      if (!apiKey) {
        sendResponse({
          ok: false,
          error: 'No API key in config.js',
          errorKind: 'auth',
          aiAuthError: true,
        });
        return;
      }

      let content = msg.payload.prompt;
      if (msg.payload.action === 'aiAltCheck' && Array.isArray(msg.payload.images) && msg.payload.images.length) {
        const maxPx = getImageSize();
        const base64Map = {};
        await Promise.all(msg.payload.images.map(async (img) => {
          try {
            base64Map[img.src] = await fetchAndResizeImage(img.src, maxPx);
          } catch (_) {
            // image fetch failed — this slot will be text-only
          }
        }));
        content = buildVisionContent(msg.payload.images, base64Map);
      }

      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: resolveAiModel(),
          max_tokens: resolveMaxTokens(),
          messages: [{ role: 'user', content }],
        }),
      })
        .then(async (r) => {
          const rawText = await r.text();
          let data = {};
          let parseFailed = false;
          if (rawText) {
            try {
              data = JSON.parse(rawText);
            } catch (_) {
              parseFailed = true;
            }
          } else if (r.ok) {
            parseFailed = true;
          }
          const text = data.content?.[0]?.text;
          if (!parseFailed && text != null && text !== '') {
            sendResponse({ ok: true, result: text });
            return;
          }
          sendResponse(classifyAnthropicFailure(r.status, data, parseFailed));
        })
        .catch((e) => {
          if (isNetworkFetchError(e)) {
            sendResponse({
              ok: false,
              error: 'Network request failed. Check your connection and try again.',
              errorKind: 'network',
              aiAuthError: false,
            });
            return;
          }
          sendResponse({
            ok: false,
            error: e?.message || 'Request failed',
            errorKind: 'api',
            aiAuthError: false,
          });
        });
    });
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

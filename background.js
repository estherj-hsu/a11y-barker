try { importScripts('config.js'); } catch (_) {}

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
    sendResponse({ ok: true, hasApiKey });
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
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: msg.payload.prompt }],
      }),
    })
      .then(r => r.json())
      .then(data => {
        if (!data.content) {
          sendResponse({ ok: false, error: data.error?.message || 'API returned no content' });
        } else {
          sendResponse({ ok: true, result: data.content[0]?.text });
        }
      })
      .catch(e => sendResponse({ ok: false, error: e.message }));
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

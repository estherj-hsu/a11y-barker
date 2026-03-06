const CONTENT_SCRIPTS = [
  'overlay/index.js',
  'overlay/coordinator.js',
  'analyzer/tabOrder.js',
  'analyzer/srContent.js',
  'analyzer/staticRules.js',
  'analyzer/imageHealth.js',
  'overlay/TabOverlay.js',
  'overlay/HeadingOverlay.js',
  'overlay/AriaHiddenOverlay.js',
  'rules-registry.js',
  'overlay/IssuesOverlay.js',
  'overlay/HeadingTreePanel.js',
  'utils/dom.js',
  'content.js',
];

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.from !== 'panel') return false;

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

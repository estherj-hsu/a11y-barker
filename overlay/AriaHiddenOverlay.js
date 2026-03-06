/**
 * Filename: overlay/AriaHiddenOverlay.js
 * Purpose: aria-hidden element overlay. getBadgeData() returns badge data for coordinator; outline is managed by this overlay.
 */
(function () {
  const OUTLINE_STYLE_ID = 'a11y-barker-aria-hidden-outline';

  function getAriaHiddenElements(doc) {
    return Array.from((doc || document).querySelectorAll('[aria-hidden="true"]'));
  }

  function addOutlineStyle(doc) {
    doc = doc || document;
    if (doc.getElementById(OUTLINE_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = OUTLINE_STYLE_ID;
    style.textContent = '[aria-hidden="true"] { outline: 2px dashed #7d8590 !important; outline-offset: 2px !important; }';
    (doc.head || doc.documentElement).appendChild(style);
  }

  function createAriaHiddenOverlay() {
    return {
      getBadgeData(doc, opts) {
        opts = opts || {};
        const problemElements = opts.problemElements || new Set();
        doc = doc || document;
        const elements = getAriaHiddenElements(doc);
        if (elements.length > 0) addOutlineStyle(doc);
        return elements.map((el) => ({
          el,
          label: 'aria-hidden',
          background: problemElements.has(el) ? '#b91c1c' : '#6b7280',
          isProblem: problemElements.has(el),
        }));
      },
      clear() {
        document.getElementById(OUTLINE_STYLE_ID)?.remove();
      },
    };
  }

  window.A11yBarkerAriaHiddenOverlay = createAriaHiddenOverlay;
})();

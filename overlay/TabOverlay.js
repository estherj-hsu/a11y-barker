/**
 * Filename: overlay/TabOverlay.js
 * Purpose: Tab order + screen reader content merged overlay. getBadgeData() returns badge data for coordinator.
 */
(function () {
  function getElementType(el) {
    const role = (el.getAttribute('role') || '').trim().toLowerCase();
    if (role) return role;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'button') return 'button';
    if (tag === 'a') return 'link';
    if (tag === 'input') {
      const t = (el.getAttribute('type') || 'text').toLowerCase();
      return t === 'submit' || t === 'button' ? 'button' : t === 'search' ? 'searchbox' : 'textbox';
    }
    if (tag === 'select') return 'listbox';
    if (tag === 'textarea') return 'textbox';
    return '';
  }

  function createTabOverlay(getTabOrderFn, getSrContentFn) {
    function getBadgeContent(el, num, doc, opts) {
      const line1Parts = [];
      if (opts?.tab) {
        line1Parts.push('Tab #' + num);
      }
      let line2 = '';
      if (opts?.sr) {
        const type = getElementType(el);
        const label = (window.getAccessibleName && window.getAccessibleName(el, doc)) || (el.getAttribute('aria-label') || el.textContent || '').trim() || '(no label)';
        line2 = (type ? '[' + type + '] ' : '') + label;
      }
      return { line1: line1Parts.join(' '), line2 };
    }

    return {
      getBadgeData(doc, opts) {
        opts = opts || {};
        const showTab = opts.tab !== false;
        const showSr = opts.sr !== false;
        const problemElements = opts.problemElements || new Set();
        const order = getTabOrderFn(doc || document);
        const out = [];
        order.forEach(({ el, order: num }) => {
          const { line1, line2 } = getBadgeContent(el, num, doc || document, { tab: showTab, sr: showSr });
          if (!line1 && !line2) return;
          out.push({
            el,
            line1,
            line2: line2 || undefined,
            background: problemElements.has(el) ? '#b91c1c' : '#333',
            isProblem: problemElements.has(el),
          });
        });
        return out;
      },
    };
  }

  window.A11yBarkerTabOverlay = createTabOverlay;
})();

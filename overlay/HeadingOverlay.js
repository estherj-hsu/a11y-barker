/**
 * Filename: overlay/HeadingOverlay.js
 * Purpose: Heading structure overlay. getBadgeData() returns badge data for coordinator.
 */
(function () {
  function getHeadings(doc) {
    const all = Array.from((doc || document).querySelectorAll('h1, h2, h3, h4, h5, h6'));
    const isVisible = window.A11yBarkerIsHeadingVisible;
    return isVisible ? all.filter((el) => isVisible(el)) : all;
  }

  function createHeadingOverlay() {
    return {
      getBadgeData(doc, opts) {
        opts = opts || {};
        const problemElements = opts.problemElements || new Set();
        const headings = getHeadings(doc || document);
        return headings.map((el) => {
          const tag = (el.tagName || '').toLowerCase();
          const level = tag.replace(/^h/, '') || '?';
          const text = (el.textContent || '').trim();
          const label = text ? `H${level}: ${text}` : `H${level}`;
          const isProblem = problemElements.has(el);
          const bg = isProblem ? '#b91c1c' : (level === '1' ? '#2563eb' : level === '2' ? '#1d4ed8' : '#1e40af');
          return { el, label, background: bg, isProblem };
        });
      },
    };
  }

  window.A11yBarkerHeadingOverlay = createHeadingOverlay;
})();

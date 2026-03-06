/**
 * Filename: analyzer/colorContrast.js
 * Purpose: WCAG 1.4.3 color contrast checker. Scans visible text elements and flags
 *   foreground/background combinations with insufficient contrast ratio.
 *   Thresholds: 4.5:1 for normal text, 3:1 for large text (>=18pt or >=14pt bold).
 *
 * Limitations:
 *   - Background color is resolved by walking up the ancestor chain; semi-transparent
 *     stacked layers and CSS gradients are not fully composited.
 *   - Images or CSS background-image behind text are not detected.
 *   - Checks up to MAX_ELEMENTS elements to stay performant on large pages.
 */
(function () {
  /**
   * Converts a single sRGB channel (0–255) to its linear light value
   * using the WCAG 2.x relative luminance formula.
   *
   * @param {number} c - Channel value 0–255
   * @returns {number}
   */
  function linearize(c) {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }

  /**
   * Computes the relative luminance of an RGB color per WCAG 2.x.
   *
   * @param {number} r
   * @param {number} g
   * @param {number} b
   * @returns {number} Luminance in range [0, 1]
   */
  function luminance(r, g, b) {
    return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
  }

  /**
   * Computes the contrast ratio between two RGB colors.
   * Returns a value in range [1, 21].
   *
   * @param {number[]} c1 - [r, g, b]
   * @param {number[]} c2 - [r, g, b]
   * @returns {number}
   */
  function contrastRatio(c1, c2) {
    const l1 = luminance(c1[0], c1[1], c1[2]);
    const l2 = luminance(c2[0], c2[1], c2[2]);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  /**
   * Parses a CSS rgb() or rgba() color string into [r, g, b].
   * Returns null for unparseable values (e.g. 'transparent', 'inherit').
   *
   * @param {string} colorStr
   * @returns {number[]|null}
   */
  function parseColor(colorStr) {
    const m = (colorStr || '').match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    return m ? [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)] : null;
  }

  /**
   * Walks up the ancestor chain to find the nearest non-transparent background color.
   * Falls back to white (#fff) if no opaque background is found, which is a reasonable
   * assumption for most pages but may be inaccurate for dark-themed pages.
   *
   * @param {Element} el
   * @param {Window} win
   * @returns {number[]} [r, g, b]
   */
  function getEffectiveBackground(el, win) {
    let node = el;
    while (node && node !== win.document.documentElement) {
      const bg = win.getComputedStyle(node).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
        const parsed = parseColor(bg);
        if (parsed) return parsed;
      }
      node = node.parentElement;
    }
    return [255, 255, 255]; // white fallback
  }

  /**
   * Returns true if the element's text qualifies as "large text" under WCAG 1.4.3:
   *   >= 18pt (24px) at any weight, or >= 14pt (~18.67px) when bold.
   *
   * @param {Element} el
   * @param {Window} win
   * @returns {boolean}
   */
  function isLargeText(el, win) {
    const style = win.getComputedStyle(el);
    const fontSize = parseFloat(style.fontSize);
    const weight = style.fontWeight;
    const isBold = parseInt(weight, 10) >= 700 || weight === 'bold' || weight === 'bolder';
    return fontSize >= 24 || (isBold && fontSize >= 18.67);
  }

  /**
   * Scans visible text elements and returns issues for elements below the contrast threshold.
   * Only elements with direct text node children are checked to avoid noise from containers.
   *
   * @param {Document} [doc]
   * @returns {Array<{rule: string, message: string, el: Element}>}
   */
  function runColorContrast(doc) {
    doc = doc || document;
    const win = doc.defaultView || window;
    const issues = [];

    // Focus on the most common text-bearing elements.
    const TEXT_SELECTORS = 'p, li, a, button, h1, h2, h3, h4, h5, h6, label, td, th, dt, dd, span, div';
    const elements = Array.from(doc.querySelectorAll(TEXT_SELECTORS));

    // Cap element count to avoid stalling on very large pages.
    const MAX_ELEMENTS = 300;
    const subset = elements.slice(0, MAX_ELEMENTS);

    subset.forEach((el) => {
      // Only check elements that have a direct text node child with non-whitespace content.
      const hasDirectText = Array.from(el.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim()
      );
      if (!hasDirectText) return;

      // Skip hidden elements.
      const style = win.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;

      const fg = parseColor(style.color);
      if (!fg) return;

      const bg = getEffectiveBackground(el, win);
      const ratio = contrastRatio(fg, bg);
      const large = isLargeText(el, win);
      const threshold = large ? 3.0 : 4.5;

      if (ratio < threshold) {
        issues.push({
          rule: 'color-contrast',
          message:
            'Contrast ratio ' +
            ratio.toFixed(2) +
            ':1 (requires ' +
            threshold +
            ':1 for ' +
            (large ? 'large' : 'normal') +
            ' text)',
          el,
        });
      }
    });

    return issues;
  }

  window.runColorContrast = runColorContrast;
})();

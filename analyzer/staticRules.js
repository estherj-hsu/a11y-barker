/**
 * Filename: analyzer/staticRules.js
 * Purpose: Static accessibility rule checks — missing alt, empty controls, tabindex, landmarks, headings, labels, links, focus.
 */
(function () {
  const LANDMARK_ROLES = ['banner', 'main', 'complementary', 'contentinfo', 'form', 'navigation', 'region', 'search'];

  /**
   * WCAG 3.1.1: Page language must be declared.
   * @param {Document} doc
   * @returns {Array<{rule: string, message: string, el: Element}>}
   */
  function checkLang(doc) {
    doc = doc || document;
    const issues = [];
    const html = doc.documentElement;
    if (html && !html.getAttribute('lang') && !html.getAttribute('xml:lang')) {
      issues.push({ rule: 'lang-missing', message: 'Page missing lang attribute on <html>', el: html });
    }
    return issues;
  }

  /**
   * WCAG 1.1.1: Non-text content (images, role=img) must have a text alternative.
   * @param {Document} doc
   * @returns {Array<{rule: string, message: string, el: Element}>}
   */
  function checkImages(doc) {
    doc = doc || document;
    const issues = [];
    doc.querySelectorAll('img, [role="img"]').forEach((el) => {
      const tag = (el.tagName || '').toLowerCase();
      const role = el.getAttribute('role') || '';
      const alt = el.getAttribute('alt');
      if (tag === 'img' && alt === null) {
        issues.push({ rule: 'missing-alt', message: 'Image missing alt', el });
      }
      if (role === 'img' && !alt && !el.getAttribute('aria-label') && !(el.textContent || '').trim()) {
        issues.push({ rule: 'missing-alt', message: 'Role img missing accessible name', el });
      }
    });
    return issues;
  }

  /**
   * WCAG 4.1.2: Interactive elements must have an accessible name.
   * @param {Document} doc
   * @returns {Array<{rule: string, message: string, el: Element}>}
   */
  function checkEmptyControls(doc) {
    doc = doc || document;
    const issues = [];
    doc.querySelectorAll('button, a[href], [role="button"], [role="link"]').forEach((el) => {
      const name = (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.textContent || '').trim();
      if (!name) {
        const tag = (el.tagName || '').toLowerCase();
        const role = el.getAttribute('role') || '';
        const label = tag === 'button' || role === 'button' ? 'button' : 'link';
        issues.push({ rule: 'empty-control', message: 'Empty ' + label, el });
      }
    });
    return issues;
  }

  /**
   * WCAG 2.4.3: Positive tabindex can break natural focus order.
   * @param {Document} doc
   * @returns {Array<{rule: string, message: string, el: Element}>}
   */
  function checkTabindex(doc) {
    doc = doc || document;
    const issues = [];
    doc.querySelectorAll('[tabindex]').forEach((el) => {
      const idx = parseInt(el.getAttribute('tabindex'), 10);
      if (idx > 0) {
        issues.push({ rule: 'tabindex-positive', message: 'tabindex=' + idx + ' (avoid positive values)', el });
      }
    });
    return issues;
  }

  /**
   * WCAG 1.3.1: Multiple landmarks of the same type should have distinguishing labels.
   * @param {Document} doc
   * @returns {Array<{rule: string, message: string, el: Element}>}
   */
  function detectDuplicateLandmarks(doc) {
    doc = doc || document;
    const issues = [];
    const seen = new WeakSet();
    const byRole = {};
    function addLandmark(el, role) {
      if (seen.has(el)) return;
      seen.add(el);
      role = (role || '').toLowerCase();
      if (!LANDMARK_ROLES.includes(role)) return;
      if (!byRole[role]) byRole[role] = [];
      byRole[role].push(el);
    }
    doc.querySelectorAll('[role]').forEach((el) => {
      addLandmark(el, el.getAttribute('role'));
    });
    doc.querySelectorAll('main, nav, aside, header, footer, form').forEach((el) => {
      const tag = (el.tagName || '').toLowerCase();
      const role = el.getAttribute('role') || (tag === 'header' ? 'banner' : tag === 'footer' ? 'contentinfo' : tag);
      addLandmark(el, role);
    });
    Object.keys(byRole).forEach((role) => {
      const els = byRole[role];
      if (els.length <= 1) return;
      const unlabeled = els.filter((el) => !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby'));
      if (unlabeled.length === 0) return;
      unlabeled.forEach((el) => {
        issues.push({ rule: 'duplicate-landmark', message: 'Duplicate landmark: ' + role, el });
      });
    });
    return issues;
  }

  /**
   * WCAG 1.3.1: Headings must not skip levels.
   * @param {Document} doc
   * @returns {Array<{rule: string, message: string, el: Element}>}
   */
  function checkHeadings(doc) {
    doc = doc || document;
    const issues = [];
    const headings = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    const stack = [];
    headings.forEach((el) => {
      const tag = (el.tagName || '').toLowerCase();
      const level = parseInt(tag.replace(/^h/, ''), 10) || 1;
      while (stack.length && stack[stack.length - 1] >= level) {
        stack.pop();
      }
      const parent = stack.length ? stack[stack.length - 1] : 0;
      const expected = parent + 1;
      if (level > expected) {
        const msg = parent > 0
          ? 'Heading hierarchy skip: H' + parent + ' → H' + level + ' (expected H' + expected + ')'
          : 'Heading hierarchy skip: H' + level + ' without preceding H1';
        issues.push({ rule: 'heading-skip', message: msg, el });
      }
      stack.push(level);
    });
    return issues;
  }

  /**
   * WCAG 1.3.1: Form inputs must have an associated label.
   * @param {Document} doc
   * @returns {Array<{rule: string, message: string, el: Element}>}
   */
  function checkInputLabels(doc) {
    doc = doc || document;
    const issues = [];
    doc.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), select, textarea').forEach((el) => {
      const id = el.getAttribute('id');
      if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return;
      if (id) {
        try {
          const label = doc.querySelector('label[for="' + CSS.escape(id) + '"]');
          if (label) return;
        } catch (_) {
          if (doc.querySelector('label[for="' + id.replace(/"/g, '\\"') + '"]')) return;
        }
      }
      if (el.closest('label')) return;
      const tag = (el.tagName || '').toLowerCase();
      issues.push({ rule: 'input-label-missing', message: (tag === 'select' ? 'Select' : tag === 'textarea' ? 'Textarea' : 'Input') + ' missing associated label', el });
    });
    return issues;
  }

  /**
   * WCAG 2.4.4: Link purpose must be determinable from link text or context.
   * @param {Document} doc
   * @returns {Array<{rule: string, message: string, el: Element}>}
   */
  function detectAmbiguousLinks(doc) {
    doc = doc || document;
    const issues = [];
    const AMBIGUOUS_LINK_TEXTS = /\b(read\s*more|click\s*(here|me)|here|more|link)\b/i;
    const linkTextCounts = {};
    doc.querySelectorAll('a[href]').forEach((el) => {
      const text = (el.textContent || '').trim().toLowerCase();
      if (!text || text.length > 30) return;
      if (AMBIGUOUS_LINK_TEXTS.test(text)) {
        const key = text.replace(/\s+/g, ' ');
        linkTextCounts[key] = (linkTextCounts[key] || []).concat(el);
      }
    });
    Object.keys(linkTextCounts).forEach((key) => {
      const els = linkTextCounts[key];
      if (els.length > 1) {
        els.forEach((el) => {
          issues.push({ rule: 'link-ambiguous', message: 'Ambiguous link: "' + key + '" appears ' + els.length + ' times', el });
        });
      }
    });
    return issues;
  }

  /**
   * WCAG 2.4.7: Keyboard focus must be visually indicated. Detects outline removal without alternative.
   * @param {Document} doc
   * @returns {Array<{rule: string, message: string, el: Element}>}
   */
  function detectFocusOutlineRemoval(doc) {
    doc = doc || document;
    const issues = [];
    let hasOutlineRemoval = false;
    let hasVisibleFocusIndicator = false;
    try {
      const styleSheets = Array.from(doc.styleSheets || []).slice(0, 80);
      for (const sheet of styleSheets) {
        try {
          const rules = sheet.cssRules || sheet.rules || [];
          for (const rule of rules) {
            if (!rule.selectorText || !rule.style) continue;
            const sel = (rule.selectorText || '').toLowerCase();
            if (!sel.includes(':focus') && !sel.includes(':focus-visible')) continue;
            const outline = (rule.style.outline || '').toLowerCase();
            const outlineWidth = (rule.style.outlineWidth || '').toLowerCase();
            const outlineColor = (rule.style.outlineColor || '').toLowerCase();
            const boxShadow = rule.style.boxShadow || rule.style.webkitBoxShadow;
            const borderColor = rule.style.borderColor;
            const backgroundColor = rule.style.backgroundColor;
            const removesOutline = (outline === 'none' || outline === '0' || outlineWidth === '0');
            const hasAlternativeInRule = !!(boxShadow || backgroundColor || borderColor);
            if (removesOutline && !hasAlternativeInRule) {
              hasOutlineRemoval = true;
            }
            const hasVisible = hasAlternativeInRule || (outline && outline !== 'none' && outline !== '0') || (outlineWidth && outlineWidth !== '0') || (outlineColor && outlineColor !== 'transparent');
            if (hasVisible && sel.includes(':focus-visible')) {
              hasVisibleFocusIndicator = true;
            }
            if (hasVisible && sel.includes(':focus') && !sel.includes(':focus-visible')) {
              hasVisibleFocusIndicator = true;
            }
          }
        } catch (_) { /* stylesheet access blocked (CORS) */ }
      }
      if (hasOutlineRemoval && !hasVisibleFocusIndicator) {
        issues.push({ rule: 'focus-visible', message: 'Focus outline removed without visible alternative', el: doc.body });
      }
    } catch (_) { /* stylesheet iteration failure */ }
    return issues;
  }

  function runStaticRules(doc) {
    doc = doc || document;
    const issues = [];
    issues.push(...checkLang(doc));
    issues.push(...checkImages(doc));
    issues.push(...checkEmptyControls(doc));
    issues.push(...checkTabindex(doc));
    issues.push(...detectDuplicateLandmarks(doc));
    issues.push(...checkHeadings(doc));
    issues.push(...checkInputLabels(doc));
    issues.push(...detectAmbiguousLinks(doc));
    issues.push(...detectFocusOutlineRemoval(doc));
    return issues;
  }

  window.runStaticRules = runStaticRules;
})();

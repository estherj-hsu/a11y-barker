/**
 * Filename: analyzer/staticRules.js
 * Purpose: Static accessibility rule checks — missing alt, empty controls, label-in-name, tabindex, landmarks, headings, labels, links, focus.
 */
(function () {
  const LANDMARK_ROLES_LIST = ['banner', 'main', 'complementary', 'contentinfo', 'form', 'navigation', 'region', 'search'];

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
   * Returns true if el or any ancestor up to boundary (exclusive) has aria-hidden="true".
   * @param {Node} el
   * @param {Element} boundary
   * @returns {boolean}
   */
  function hasAriaHiddenAncestor(el, boundary) {
    let n = el.nodeType === Node.TEXT_NODE ? el.parentNode : el;
    while (n && n !== boundary) {
      if (n.nodeType === Node.ELEMENT_NODE && n.getAttribute && n.getAttribute('aria-hidden') === 'true') {
        return true;
      }
      n = n.parentNode;
    }
    return !!(boundary && boundary.getAttribute && boundary.getAttribute('aria-hidden') === 'true');
  }

  /**
   * Visible label text: TEXT_NODE descendants only; skip aria-hidden subtrees; skip entire SVG subtrees.
   * @param {Element} root
   * @returns {string}
   */
  function collectVisibleTextForLabelInName(root) {
    const chunks = [];
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (!hasAriaHiddenAncestor(node, root)) {
          chunks.push(node.textContent);
        }
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const tag = (node.tagName || '').toLowerCase();
      if (tag === 'svg') return;
      if (node.getAttribute && node.getAttribute('aria-hidden') === 'true') return;
      if (hasAriaHiddenAncestor(node, root)) return;
      for (let i = 0; i < node.childNodes.length; i++) {
        walk(node.childNodes[i]);
      }
    }
    for (let i = 0; i < root.childNodes.length; i++) {
      walk(root.childNodes[i]);
    }
    return chunks.join('').replace(/\s+/g, ' ').trim();
  }

  /**
   * WCAG 2.5.3: Accessible name must contain visible label text (voice input).
   * @param {Document} doc
   * @returns {Array<{rule: string, message: string, el: Element}>}
   */
  function checkLabelInName(doc) {
    doc = doc || document;
    const issues = [];
    const selector =
      'button, a[href], input[type="submit"], input[type="button"], input[type="reset"], [role="button"], [role="link"]';
    doc.querySelectorAll(selector).forEach((el) => {
      const visibleText = collectVisibleTextForLabelInName(el);
      if (!visibleText) return;
      const getName = window.getAccessibleName;
      const rawName = getName ? getName(el, doc) : el.getAttribute('aria-label') || '';
      const accessibleName = (rawName || '').replace(/\s+/g, ' ').trim();
      if (!accessibleName) return;
      if (accessibleName.toLowerCase().includes(visibleText.toLowerCase())) return;
      issues.push({
        rule: 'label-in-name',
        message:
          'Accessible name "' + accessibleName + '" does not contain visible text "' + visibleText + '"',
        el,
      });
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
      if (!LANDMARK_ROLES_LIST.includes(role)) return;
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
   * WCAG 2.4.7: Keyboard focus must be visually indicated.
   * Scans all accessible stylesheets for :focus or :focus-visible rules that remove
   * the outline without providing an alternative (box-shadow, border, background).
   *
   * Limitations: cross-origin stylesheets are inaccessible (CORS); Shadow DOM stylesheets
   * inside third-party web components cannot be inspected from outside the shadow root.
   *
   * @param {Document} doc
   * @returns {Array<{rule: string, message: string, el: Element}>}
   */
  function detectFocusOutlineRemoval(doc) {
    doc = doc || document;
    const issues = [];
    let hasOutlineRemoval = false;
    let hasVisibleFocusIndicator = false;
    try {
      const styleSheets = Array.from(doc.styleSheets || []);
      for (const sheet of styleSheets) {
        try {
          const rules = sheet.cssRules || sheet.rules || [];
          for (const rule of rules) {
            if (!rule.selectorText || !rule.style) continue;
            const sel = (rule.selectorText || '').toLowerCase();
            if (!sel.includes(':focus') && !sel.includes(':focus-visible')) continue;

            const outline = (rule.style.outline || '').toLowerCase().trim();
            const outlineStyle = (rule.style.outlineStyle || '').toLowerCase().trim();
            const outlineWidth = (rule.style.outlineWidth || '').toLowerCase().trim();
            const outlineColor = (rule.style.outlineColor || '').toLowerCase().trim();
            const boxShadow = rule.style.boxShadow || rule.style.webkitBoxShadow;
            const borderColor = rule.style.borderColor;
            const backgroundColor = rule.style.backgroundColor;

            // Detect outline removal: covers outline:none, outline:0, outline:0px,
            // outline-style:none, outline-width:0, outline-width:0px.
            const removesOutline =
              outline === 'none' ||
              outline === '0' ||
              outline === '0px' ||
              outlineStyle === 'none' ||
              outlineWidth === '0' ||
              outlineWidth === '0px';

            // An alternative focus indicator replaces the outline visually.
            const hasAlternativeInRule = !!(boxShadow || backgroundColor || borderColor);

            if (removesOutline && !hasAlternativeInRule) {
              hasOutlineRemoval = true;
            }

            // A visible focus rule: has an outline that is not removed, or has an alternative.
            const hasVisible =
              hasAlternativeInRule ||
              (outline && outline !== 'none' && outline !== '0' && outline !== '0px') ||
              (outlineWidth && outlineWidth !== '0' && outlineWidth !== '0px') ||
              (outlineColor && outlineColor !== 'transparent');

            if (hasVisible && (sel.includes(':focus-visible') || sel.includes(':focus'))) {
              hasVisibleFocusIndicator = true;
            }
          }
        } catch (_) { /* stylesheet access blocked by CORS */ }
      }
      if (hasOutlineRemoval && !hasVisibleFocusIndicator) {
        issues.push({
          rule: 'focus-visible',
          message: 'Focus outline removed without visible alternative',
          el: doc.body,
        });
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
    issues.push(...checkLabelInName(doc));
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

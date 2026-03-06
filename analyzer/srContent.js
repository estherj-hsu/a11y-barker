/**
 * Filename: analyzer/srContent.js
 * Purpose: Simplified accessible name computation (accname algorithm).
 *   Priority order: aria-labelledby → aria-label → alt (images) → label[for] →
 *   parent label → placeholder → title → text content.
 *   Also computes accessible descriptions via aria-describedby / aria-description.
 */
(function () {
  /**
   * Returns the text content of an element, excluding any subtrees marked
   * aria-hidden="true" (which are hidden from assistive technologies).
   * Unlike el.textContent, this respects aria-hidden on child elements.
   *
   * @param {Element} el
   * @returns {string}
   */
  function getTextContent(el) {
    if (!el || !el.getAttribute) return '';
    if (el.getAttribute('aria-hidden') === 'true') return '';

    // Recursively collect text, skipping aria-hidden subtrees.
    let text = '';
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        text += getTextContent(child);
      }
    }
    return text.trim();
  }

  /**
   * Resolves a space-separated list of id references to their elements,
   * preserving the specified order (important for aria-labelledby).
   *
   * @param {Document} doc
   * @param {string} ids - Space-separated list of element IDs
   * @returns {Element[]}
   */
  function resolveIdRefs(doc, ids) {
    if (!ids) return [];
    return ids
      .split(/\s+/)
      .map((id) => doc.getElementById(id.trim()))
      .filter(Boolean);
  }

  /**
   * Computes the accessible name for an element following a simplified accname algorithm.
   * Handles: aria-labelledby (multiple IDs in order), aria-label, alt, label[for],
   * parent label, placeholder, title, input[type=image], and name-from-content roles.
   *
   * @param {Element} el
   * @param {Document} [doc]
   * @returns {string}
   */
  function getAccessibleName(el, doc) {
    doc = doc || el.ownerDocument;
    if (!el || !doc) return '';

    // 1. aria-labelledby: concatenate text of all referenced elements in listed order.
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      const refs = resolveIdRefs(doc, labelledby);
      const text = refs.map(getTextContent).filter(Boolean).join(' ');
      if (text) return text;
    }

    // 2. aria-label (explicit string label).
    const label = el.getAttribute('aria-label');
    if (label && label.trim()) return label.trim();

    const tag = (el.tagName || '').toLowerCase();
    const role = (el.getAttribute('role') || '').toLowerCase();

    // 3. img / area: use alt attribute. Empty alt ('') means decorative — return '' intentionally.
    if (tag === 'img' || tag === 'area') {
      const alt = el.getAttribute('alt');
      return alt != null ? alt : '';
    }

    // 4. input[type=image]: use alt attribute.
    if (tag === 'input' && (el.getAttribute('type') || '').toLowerCase() === 'image') {
      return el.getAttribute('alt') || '';
    }

    // 5. Form controls: look for associated <label> element, then parent <label>.
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      const id = el.getAttribute('id');
      if (id) {
        const labelEl = Array.from(doc.querySelectorAll('label[for]')).find(
          (l) => l.getAttribute('for') === id
        );
        if (labelEl) return getTextContent(labelEl) || '';
      }
      const parentLabel = el.closest('label');
      if (parentLabel) return getTextContent(parentLabel) || '';
      const placeholder = el.getAttribute('placeholder');
      if (placeholder) return placeholder;
    }

    // 6. figure: use figcaption text.
    if (tag === 'figure') {
      const figcaption = el.querySelector('figcaption');
      if (figcaption) return getTextContent(figcaption) || '';
    }

    // 7. title attribute as last fallback before content.
    const title = el.getAttribute('title');
    if (title && title.trim()) return title.trim();

    // 8. Name-from-content roles: use the element's own text.
    const nameFromContent =
      ['button', 'a', 'summary', 'option'].includes(tag) ||
      ['button', 'link', 'menuitem', 'tab', 'option', 'treeitem'].some((r) => role.includes(r));
    if (nameFromContent) {
      return getTextContent(el) || '';
    }

    return '';
  }

  /**
   * Computes the accessible description for an element.
   * Checks aria-describedby (multiple IDs in order) then aria-description.
   *
   * @param {Element} el
   * @param {Document} [doc]
   * @returns {string}
   */
  function getAccessibleDescription(el, doc) {
    doc = doc || el.ownerDocument;
    if (!el || !doc) return '';

    const describedby = el.getAttribute('aria-describedby');
    if (describedby) {
      const refs = resolveIdRefs(doc, describedby);
      const text = refs.map(getTextContent).filter(Boolean).join(' ');
      if (text) return text;
    }

    const desc = el.getAttribute('aria-description');
    if (desc && desc.trim()) return desc.trim();

    return '';
  }

  /**
   * Returns a formatted string combining role, accessible name, and description.
   * Used by TabOverlay to label focusable elements in overlay badges.
   *
   * @param {Element} el
   * @param {Document} [doc]
   * @returns {string} e.g. "[button] Submit form — Press to continue"
   */
  function getSrContent(el, doc) {
    doc = doc || el.ownerDocument;
    const name = getAccessibleName(el, doc);
    const desc = getAccessibleDescription(el, doc);
    const role = el.getAttribute('role') || '';
    const tag = (el.tagName || '').toLowerCase();

    const roleLabel =
      role ||
      (tag === 'button' ? 'button' : tag === 'a' ? 'link' : tag === 'input' ? 'textbox' : '');

    const parts = [];
    if (roleLabel) parts.push('[' + roleLabel + ']');
    if (name) parts.push(name);
    if (desc) parts.push(' — ' + desc);

    return parts.length ? parts.join(' ') : '(no name)';
  }

  window.getAccessibleName = getAccessibleName;
  window.getAccessibleDescription = getAccessibleDescription;
  window.getSrContent = getSrContent;
})();

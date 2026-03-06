/**
 * Accessible name 計算邏輯（簡化版 accname）
 * 支援：aria-labelledby, aria-label, alt, label[for], placeholder, title, innerText
 */
(function () {
  function getTextContent(el) {
    if (!el || !el.getAttribute) return '';
    const ariaHidden = el.getAttribute('aria-hidden');
    if (ariaHidden === 'true') return '';
    return (el.textContent || '').trim();
  }

  function resolveIdRefs(doc, ids) {
    if (!ids) return [];
    return ids
      .split(/\s+/)
      .map((id) => doc.getElementById(id.trim()))
      .filter(Boolean);
  }

  function getAccessibleName(el, doc) {
    doc = doc || el.ownerDocument;
    if (!el || !doc) return '';

    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      const refs = resolveIdRefs(doc, labelledby);
      return refs.map(getTextContent).filter(Boolean).join(' ') || '';
    }

    const label = el.getAttribute('aria-label');
    if (label && label.trim()) return label.trim();

    const tag = (el.tagName || '').toLowerCase();
    const role = (el.getAttribute('role') || '').toLowerCase();

    if (tag === 'img' || tag === 'area') {
      const alt = el.getAttribute('alt');
      return alt != null ? alt : '';
    }

    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      const id = el.getAttribute('id');
      if (id) {
        const labelEl = Array.from(doc.querySelectorAll('label[for]')).find((l) => l.getAttribute('for') === id);
        if (labelEl) return getTextContent(labelEl) || '';
      }
      const byParent = el.closest('label');
      if (byParent) return getTextContent(byParent) || '';
      const placeholder = el.getAttribute('placeholder');
      if (placeholder) return placeholder;
    }

    if (tag === 'figure') {
      const figcaption = el.querySelector('figcaption');
      if (figcaption) return getTextContent(figcaption) || '';
    }

    const title = el.getAttribute('title');
    if (title && title.trim()) return title.trim();

    const nameFromContent = ['button', 'a', 'summary', 'option'].includes(tag) ||
      ['button', 'link', 'menuitem', 'tab', 'option', 'treeitem'].some((r) => role.includes(r));
    if (nameFromContent) {
      return getTextContent(el) || '';
    }

    return '';
  }

  function getAccessibleDescription(el, doc) {
    doc = doc || el.ownerDocument;
    if (!el || !doc) return '';

    const describedby = el.getAttribute('aria-describedby');
    if (describedby) {
      const refs = resolveIdRefs(doc, describedby);
      return refs.map(getTextContent).filter(Boolean).join(' ') || '';
    }

    const desc = el.getAttribute('aria-description');
    if (desc && desc.trim()) return desc.trim();

    return '';
  }

  function getSrContent(el, doc) {
    doc = doc || el.ownerDocument;
    const name = getAccessibleName(el, doc);
    const desc = getAccessibleDescription(el, doc);
    const role = el.getAttribute('role') || '';
    const tag = (el.tagName || '').toLowerCase();

    const roleLabel = role || (tag === 'button' ? 'button' : tag === 'a' ? 'link' : tag === 'input' ? 'textbox' : '');

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

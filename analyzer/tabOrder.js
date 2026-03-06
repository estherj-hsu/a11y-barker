/**
 * Filename: analyzer/tabOrder.js
 * Purpose: Computes the keyboard tab order for focusable elements on the page.
 *   Respects tabindex ordering (positive tabindex values sort first, then DOM order).
 *   Skips elements that are hidden inside tabs, accordions, or collapsed dropdowns.
 */

/**
 * Returns true if the element is visible and reachable via keyboard navigation.
 * Walks up the ancestor chain to check for hidden parents, aria-hidden, and
 * display/visibility overrides. Also skips zero-sized elements.
 *
 * @param {Element} el - The element to test
 * @param {Document} doc - The owner document
 * @returns {boolean}
 */
function isInView(el, doc) {
  let node = el;
  const win = doc.defaultView || document.defaultView;
  while (node && node !== doc.body) {
    if (node.hidden === true) return false;
    if (node.getAttribute?.('aria-hidden') === 'true') return false;
    const style = win?.getComputedStyle(node);
    if (style?.display === 'none' || style?.visibility === 'hidden') return false;
    node = node.parentElement;
  }
  // Zero-sized elements (e.g. collapsed accordion panels) are not reachable.
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  return true;
}

/**
 * Returns all focusable elements in tab order. Positive tabindex elements come first
 * (sorted ascending by tabindex value), followed by tabindex=0 and natural focusables
 * in DOM order.
 *
 * @param {Document} [doc] - Document to query (default: document)
 * @returns {Array<{el: Element, order: number}>}
 */
function getTabOrder(doc) {
  doc = doc || document;
  const focusables = doc.querySelectorAll(
    'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])'
  );

  const elements = Array.from(focusables).filter((el) => {
    if (el.disabled || el.getAttribute('aria-hidden') === 'true') return false;
    if (!isInView(el, doc)) return false;
    const style = doc.defaultView?.getComputedStyle(el);
    return style?.visibility !== 'hidden' && style?.display !== 'none';
  });

  // Separate positive-tabindex elements (sorted by value) from natural-order elements.
  const withTabindex = [];
  const withoutTabindex = [];

  elements.forEach((el) => {
    const idx = el.getAttribute('tabindex');
    const num = idx === null ? 0 : parseInt(idx, 10);
    if (num > 0) {
      withTabindex.push({ el, tabindex: num });
    } else {
      withoutTabindex.push({ el });
    }
  });

  withTabindex.sort((a, b) => a.tabindex - b.tabindex);

  // Merge: positive tabindex first, then DOM order.
  const all = [...withTabindex.map((x) => x.el), ...withoutTabindex.map((x) => x.el)];
  const domOrder = elements;

  all.sort((a, b) => {
    const aTab = parseInt(a.getAttribute('tabindex') || '0', 10);
    const bTab = parseInt(b.getAttribute('tabindex') || '0', 10);
    if (aTab > 0 && bTab > 0) return aTab - bTab;
    if (aTab > 0) return -1;
    if (bTab > 0) return 1;
    return domOrder.indexOf(a) - domOrder.indexOf(b);
  });

  return all.map((el, i) => ({ el, order: i + 1 }));
}

window.getTabOrder = getTabOrder;

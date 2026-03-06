/**
 * Filename: utils/dom.js
 * Purpose: DOM utility functions for A11y Barker — issue grouping and document-order sorting.
 */
(function () {
  /**
   * Sorts an array of issue objects by their element's position in the document.
   * Uses compareDocumentPosition for reliable DOM order. Disconnected nodes sort to the end.
   * @param {Array<{el: Element}>} issues - Array of issue objects, each with an `el` property
   */
  function sortIssuesByDOMOrder(issues) {
    function docOrder(a, b) {
      const elA = a.el;
      const elB = b.el;
      if (!elA?.isConnected) return 1;
      if (!elB?.isConnected) return -1;
      const pos = elA.compareDocumentPosition(elB);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      if (pos & Node.DOCUMENT_POSITION_CONTAINED_BY) return -1;
      if (pos & Node.DOCUMENT_POSITION_CONTAINS) return 1;
      return 0;
    }
    issues.sort(docOrder);
  }

  /**
   * Groups issues by their target element, preserving first-occurrence DOM order.
   * @param {Array<{el: Element, rule?: string, message?: string}>} issues - Flat array of issue objects
   * @returns {Array<Array>} Array of issue arrays, one per element, ordered by DOM
   */
  function groupIssuesByElement(issues) {
    const byEl = new Map();
    const order = [];
    issues.forEach((item) => {
      if (!item.el?.isConnected) return;
      if (!byEl.has(item.el)) {
        byEl.set(item.el, []);
        order.push(item.el);
      }
      byEl.get(item.el).push(item);
    });
    return order.map((el) => byEl.get(el));
  }

  window.A11yBarkerDomUtils = { groupIssuesByElement, sortIssuesByDOMOrder };
})();

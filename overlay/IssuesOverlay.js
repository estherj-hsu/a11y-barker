/**
 * Filename: overlay/IssuesOverlay.js
 * Purpose: Issues overlay. getBadgeData() returns badge data for coordinator. Kept for potential future use;
 *   currently content.js builds standalone issue badges inline in refreshOverlays().
 */
(function () {
  function createIssuesOverlay() {
    return {
      getBadgeData(issues) {
        if (!issues || issues.length === 0) return [];
        const isVisible = window.A11yBarkerIsHeadingVisible;
        const byEl = new Map();
        issues.forEach((item) => {
          if (!item.el?.isConnected) return;
          if (isVisible && !isVisible(item.el)) return;
          const list = byEl.get(item.el) || [];
          list.push(item);
          byEl.set(item.el, list);
        });
        const out = [];
        const RULES = window.A11Y_BARKER_RULES || {};
        byEl.forEach((itemList, el) => {
          const label = itemList.length > 1
            ? itemList.map((i) => RULES[i.rule]?.label || 'Issue').join(', ')
            : (RULES[itemList[0].rule]?.label || 'Issue');
          out.push({
            el,
            label,
            background: '#b91c1c',
            isProblem: true,
          });
        });
        return out;
      },
    };
  }

  window.A11yBarkerIssuesOverlay = createIssuesOverlay;
})();

/**
 * Filename: content.js
 * Purpose: Content script — main logic for DevTools panel messaging, DOM analysis, and overlay orchestration.
 */
(function () {
  function extValid() {
    try {
      return !!chrome?.runtime?.id;
    } catch (_) {
      return false;
    }
  }

  const TAB_KEY = 'a11yBarkerTabOrder';
  const SR_KEY = 'a11yBarkerSrContent';
  const HEADING_KEY = 'a11yBarkerHeading';
  const ARIA_HIDDEN_KEY = 'a11yBarkerAriaHidden';
  const ISSUES_PANEL_KEY = 'a11yBarkerIssuesPanel';

  const DEFAULTS = {
    [TAB_KEY]: true,
    [SR_KEY]: true,
    [HEADING_KEY]: true,
    [ARIA_HIDDEN_KEY]: true,
    [ISSUES_PANEL_KEY]: true,
  };

  let overlayInstances = null;
  let featureFlags = { ...DEFAULTS };
  let overlayActive = false;
  let mutationObs = null;
  let refreshTimeout = null;
  let scrollRaf = null;
  let lastIssues = [];
  let lastIssuesGrouped = [];
  let lastHeadings = [];
  const HIGHLIGHT_CLASS = 'a11y-barker-issue-highlight';
  const REFRESH_DEBOUNCE_MS = 200;

  /**
   * Ensures the highlight stylesheet is injected into the page. Idempotent.
   * Called once at scan start so issue/heading highlight outlines work.
   */
  function ensureHighlightStyles() {
    if (document.getElementById('a11y-barker-highlight-styles')) return;
    const style = document.createElement('style');
    style.id = 'a11y-barker-highlight-styles';
    style.textContent = '.' + HIGHLIGHT_CLASS + ' { outline: 3px solid #f59e0b !important; outline-offset: 2px !important; }';
    (document.head || document.documentElement).appendChild(style);
  }

  /**
   * Loads feature flags from chrome.storage.local and merges into featureFlags.
   * @param {Function} cb - Callback invoked when load completes (or on failure)
   */
  function loadState(cb) {
    if (!extValid()) {
      cb();
      return;
    }
    try {
      chrome.storage.local.get([TAB_KEY, SR_KEY, HEADING_KEY, ARIA_HIDDEN_KEY, ISSUES_PANEL_KEY], (data) => {
        if (!extValid()) return;
        try {
          featureFlags = {
            [TAB_KEY]: data[TAB_KEY] !== undefined ? !!data[TAB_KEY] : DEFAULTS[TAB_KEY],
            [SR_KEY]: data[SR_KEY] !== undefined ? !!data[SR_KEY] : DEFAULTS[SR_KEY],
            [HEADING_KEY]: data[HEADING_KEY] !== undefined ? !!data[HEADING_KEY] : DEFAULTS[HEADING_KEY],
            [ARIA_HIDDEN_KEY]: data[ARIA_HIDDEN_KEY] !== undefined ? !!data[ARIA_HIDDEN_KEY] : DEFAULTS[ARIA_HIDDEN_KEY],
            [ISSUES_PANEL_KEY]: data[ISSUES_PANEL_KEY] !== undefined ? !!data[ISSUES_PANEL_KEY] : DEFAULTS[ISSUES_PANEL_KEY],
          };
          cb();
        } catch (_) { /* storage parse error */ }
      });
    } catch (_) {
      cb();
    }
  }

  /**
   * Returns heading data for the document: level, text, element reference.
   * @param {Document} [doc] - Document to query (default: document)
   * @returns {Array<{el: Element, level: number, text: string}>}
   */
  function getHeadingsData(doc) {
    doc = doc || document;
    const all = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    const isVisible = window.A11yBarkerIsHeadingVisible;
    const els = isVisible ? all.filter((el) => isVisible(el)) : all;
    return els.map((el) => {
      const tag = (el.tagName || '').toLowerCase();
      const level = parseInt(tag.replace(/^h/, ''), 10) || 1;
      const text = (el.textContent || '').trim().slice(0, 60);
      return { el, level, text };
    });
  }

  /**
   * Runs static rules and image health checks, returns issues sorted by DOM order.
   * @param {Document} [doc] - Document to analyze
   * @returns {Array<{el: Element, rule: string, message: string}>}
   */
  function getIssues(doc) {
    const rules = window.runStaticRules ? window.runStaticRules(doc) : [];
    const images = window.runImageHealth ? window.runImageHealth(doc) : [];
    const issues = [...rules, ...images];
    window.A11yBarkerDomUtils?.sortIssuesByDOMOrder(issues);
    return issues;
  }

  /**
   * Highlights an issue element by flat index. Removes previous highlight, scrolls into view.
   * @param {number} i - Index into lastIssues
   */
  function highlightByIndex(i) {
    document.querySelectorAll('.' + HIGHLIGHT_CLASS).forEach((e) => e.classList.remove(HIGHLIGHT_CLASS));
    const item = lastIssues[i];
    if (item?.el?.isConnected) {
      item.el.classList.add(HIGHLIGHT_CLASS);
      item.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  /**
   * Removes all highlight outlines from the page.
   */
  function unhighlight() {
    document.querySelectorAll('.' + HIGHLIGHT_CLASS).forEach((e) => e.classList.remove(HIGHLIGHT_CLASS));
  }

  /**
   * Creates overlay instances (tab, heading, ariaHidden, coordinator, headingTreePanel) on first call.
   * @returns {Object} overlayInstances
   */
  function createOverlays() {
    if (overlayInstances) return overlayInstances;
    const getTabOrder = window.getTabOrder;
    const getSrContent = window.getSrContent;
    overlayInstances = {
      tab: (getTabOrder && getSrContent && window.A11yBarkerTabOverlay)
        ? window.A11yBarkerTabOverlay(getTabOrder, getSrContent)
        : null,
      heading: window.A11yBarkerHeadingOverlay && window.A11yBarkerHeadingOverlay(),
      ariaHidden: window.A11yBarkerAriaHiddenOverlay && window.A11yBarkerAriaHiddenOverlay(),
      coordinator: window.A11yBarkerCoordinator && window.A11yBarkerCoordinator(),
      headingTreePanel: window.A11yBarkerHeadingTreePanel && window.A11yBarkerHeadingTreePanel(),
    };
    return overlayInstances;
  }

  /**
   * Initiates a scan: shows overlay, runs analyzers, refreshes badges, sends issues to panel.
   */
  function onScan() {
    overlayActive = true;
    ensureHighlightStyles();
    window.A11yBarkerOverlay?.init();
    window.A11yBarkerOverlay?.show();
    createOverlays();
    lastIssues = getIssues(document);
    lastIssuesGrouped = window.A11yBarkerDomUtils?.groupIssuesByElement(lastIssues) || [];
    lastHeadings = getHeadingsData(document);
    refreshOverlays(document);
    try {
      const groupedForPanel = lastIssuesGrouped.map((group) => ({
        issues: group.map(({ rule, message }) => ({ rule, message })),
      }));
      chrome.runtime.sendMessage({
        source: 'content',
        action: 'issues',
        issues: groupedForPanel,
      });
    } catch (_) { /* messaging failure */ }
    startMutationObserver();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
  }

  /**
   * Stops the overlay, clears coordinator, removes observers and listeners.
   */
  function stopOverlay() {
    overlayActive = false;
    window.A11yBarkerOverlay?.hide();
    if (overlayInstances) {
      overlayInstances.coordinator?.clear?.();
      overlayInstances.ariaHidden?.clear?.();
      overlayInstances.headingTreePanel?.clear?.();
    }
    overlayInstances = null;
    stopMutationObserver();
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    unhighlight();
  }

  /**
   * Refreshes all overlay badges from current feature flags and issue data.
   * Builds tab/heading/ariaHidden data, adds standalone issue badges for uncovered problem elements,
   * updates coordinator and heading tree panel.
   * @param {Document} [doc] - Document to refresh
   */
  function refreshOverlays(doc) {
    if (!extValid() || !overlayActive) return;
    doc = doc || document;
    if (!overlayInstances) return;
    const problemsFromIssues = lastIssues.length ? new Set(lastIssues.map((i) => i.el).filter(Boolean)) : new Set();
    const problems = featureFlags[ISSUES_PANEL_KEY] ? problemsFromIssues : new Set();
    const opts = { tab: featureFlags[TAB_KEY], sr: featureFlags[SR_KEY], problemElements: problems };
    try {
      if (!featureFlags[ARIA_HIDDEN_KEY]) overlayInstances.ariaHidden?.clear?.();
      const allOverlayData = {
        tab: overlayInstances.tab && (featureFlags[TAB_KEY] || featureFlags[SR_KEY])
          ? overlayInstances.tab.getBadgeData(doc, opts) : [],
        heading: featureFlags[HEADING_KEY] ? overlayInstances.heading?.getBadgeData?.(doc, { problemElements: problems }) : [],
        ariaHidden: featureFlags[ARIA_HIDDEN_KEY] ? overlayInstances.ariaHidden?.getBadgeData?.(doc, { problemElements: problems }) : [],
      };
      const coveredEls = new Set([
        ...(allOverlayData.tab || []).map((d) => d.el),
        ...(allOverlayData.heading || []).map((d) => d.el),
        ...(allOverlayData.ariaHidden || []).map((d) => d.el),
      ]);
      allOverlayData.issues = [];
      if (featureFlags[ISSUES_PANEL_KEY]) {
        problemsFromIssues.forEach((el) => {
          if (!el?.isConnected) return;
          if (coveredEls.has(el)) return;
          const itemsForEl = lastIssues.filter((i) => i.el === el);
          const RULES = window.A11Y_BARKER_RULES || {};
          const label = itemsForEl.map((i) => RULES[i.rule]?.label || 'Issue').join(', ');
          allOverlayData.issues.push({ el, label, background: '#b91c1c', isProblem: true });
        });
      }
      overlayInstances.coordinator?.update?.(allOverlayData);
      overlayInstances.coordinator?.positionBadges?.();
      lastHeadings = getHeadingsData(doc);
      if (featureFlags[HEADING_KEY]) {
        overlayInstances.headingTreePanel?.update?.(lastHeadings, problems, (index) => {
          document.querySelectorAll('.' + HIGHLIGHT_CLASS).forEach((e) => e.classList.remove(HIGHLIGHT_CLASS));
          const h = lastHeadings[index];
          if (h?.el?.isConnected) {
            h.el.classList.add(HIGHLIGHT_CLASS);
            h.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        });
      } else {
        overlayInstances.headingTreePanel?.clear?.();
      }
    } catch (_) { /* overlay update failure */ }
  }

  /**
   * Re-positions all badges (e.g. after scroll/resize).
   */
  function positionOverlays() {
    if (!overlayInstances || !overlayActive) return;
    overlayInstances.coordinator?.positionBadges?.();
  }

  /**
   * Debounced refresh trigger for mutation observer.
   */
  function onMutation() {
    if (!extValid() || !overlayActive) return;
    if (refreshTimeout) clearTimeout(refreshTimeout);
    refreshTimeout = setTimeout(() => {
      refreshTimeout = null;
      if (!extValid()) return;
      refreshOverlays();
    }, REFRESH_DEBOUNCE_MS);
  }

  /**
   * Starts the mutation observer to refresh overlays when DOM changes.
   */
  function startMutationObserver() {
    if (mutationObs) return;
    mutationObs = new MutationObserver(onMutation);
    mutationObs.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden', 'aria-hidden', 'style', 'class']
    });
  }

  /**
   * Stops the mutation observer and clears pending refresh timeout.
   */
  function stopMutationObserver() {
    if (mutationObs) {
      mutationObs.disconnect();
      mutationObs = null;
    }
    if (refreshTimeout) {
      clearTimeout(refreshTimeout);
      refreshTimeout = null;
    }
  }

  /**
   * RAF-throttled scroll handler to re-position badges.
   */
  function onScroll() {
    if (!extValid() || !overlayActive) return;
    if (scrollRaf) cancelAnimationFrame(scrollRaf);
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = null;
      positionOverlays();
    });
  }

  loadState(() => { });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const reply = (r) => {
      try { sendResponse(r); } catch (_) { }
    };
    if (!extValid()) {
      reply({ ok: false });
      return true;
    }
    try {
      switch (msg.action) {
        case 'scan':
          onScan();
          reply({ ok: true });
          break;
        case 'clear':
          stopOverlay();
          lastIssues = [];
          lastIssuesGrouped = [];
          lastHeadings = [];
          try {
            chrome.runtime.sendMessage({ source: 'content', action: 'issues', issues: [] });
          } catch (_) { }
          reply({ ok: true });
          break;
        case 'setFlag':
          if (msg.key && msg.val !== undefined) {
            featureFlags[msg.key] = !!msg.val;
            chrome.storage.local.set({ [msg.key]: msg.val });
            if (overlayActive) refreshOverlays();
          }
          reply({ ok: true });
          break;
        case 'refresh':
          if (overlayActive) refreshOverlays();
          reply({ ok: true });
          break;
        case 'getIssues':
          lastIssues = getIssues(document);
          lastIssuesGrouped = window.A11yBarkerDomUtils?.groupIssuesByElement(lastIssues) || [];
          reply({
            issues: lastIssuesGrouped.map((group) => ({
              issues: group.map(({ rule, message }) => ({ rule, message })),
            })),
          });
          break;
        case 'highlight':
          if (msg.groupIndex != null) {
            const group = lastIssuesGrouped[msg.groupIndex];
            if (group?.[0]?.el?.isConnected) {
              document.querySelectorAll('.' + HIGHLIGHT_CLASS).forEach((e) => e.classList.remove(HIGHLIGHT_CLASS));
              group[0].el.classList.add(HIGHLIGHT_CLASS);
              group[0].el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          } else if (msg.index != null) {
            highlightByIndex(msg.index);
          }
          reply({ ok: true });
          break;
        case 'unhighlight':
          unhighlight();
          reply({ ok: true });
          break;
        default:
          reply({ ok: false });
      }
    } catch (e) {
      reply({ ok: false, error: e?.message || 'Scan failed' });
    }
    return true;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    try {
      if (!extValid() || area !== 'local') return;
      if (changes[TAB_KEY]) featureFlags[TAB_KEY] = !!changes[TAB_KEY].newValue;
      if (changes[SR_KEY]) featureFlags[SR_KEY] = !!changes[SR_KEY].newValue;
      if (changes[HEADING_KEY]) featureFlags[HEADING_KEY] = !!changes[HEADING_KEY].newValue;
      if (changes[ARIA_HIDDEN_KEY]) featureFlags[ARIA_HIDDEN_KEY] = !!changes[ARIA_HIDDEN_KEY].newValue;
      if (changes[ISSUES_PANEL_KEY]) featureFlags[ISSUES_PANEL_KEY] = !!changes[ISSUES_PANEL_KEY].newValue;
      if (overlayActive) refreshOverlays();
    } catch (_) { }
  });
})();

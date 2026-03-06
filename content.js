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
   * The pulse animation runs 3 cycles on highlight, then settles to a steady outline.
   */
  function ensureHighlightStyles() {
    if (document.getElementById('a11y-barker-highlight-styles')) return;
    const style = document.createElement('style');
    style.id = 'a11y-barker-highlight-styles';
    style.textContent = [
      '@keyframes a11y-barker-pulse {',
      '  0%,100% { outline-color: #f59e0b; }',
      '  50% { outline-color: transparent; }',
      '}',
      '.' + HIGHLIGHT_CLASS + ' {',
      '  outline: 3px solid #f59e0b !important;',
      '  outline-offset: 2px !important;',
      '  animation: a11y-barker-pulse 0.5s ease-in-out 3 !important;',
      '}',
    ].join('\n');
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
   * Returns landmark data for export: role and label.
   * @param {Document} [doc]
   * @returns {Array<{role: string, label: string|null}>}
   */
  function getLandmarksData(doc) {
    doc = doc || document;
    const landmarkRoles = ['banner', 'main', 'complementary', 'contentinfo', 'form', 'navigation', 'region', 'search'];
    const seen = new WeakSet();
    const out = [];
    function addLandmark(el, role) {
      if (seen.has(el)) return;
      seen.add(el);
      role = (role || '').toLowerCase();
      if (!landmarkRoles.includes(role)) return;
      const label = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || null;
      const labelResolved = label ? (window.getAccessibleName && window.getAccessibleName(el, doc)) : null;
      out.push({ role, label: labelResolved || label || null });
    }
    doc.querySelectorAll('[role]').forEach((el) => addLandmark(el, el.getAttribute('role')));
    doc.querySelectorAll('main, nav, aside, header, footer, form').forEach((el) => {
      const tag = (el.tagName || '').toLowerCase();
      const role = el.getAttribute('role') || (tag === 'header' ? 'banner' : tag === 'footer' ? 'contentinfo' : tag);
      addLandmark(el, role);
    });
    return out;
  }

  /**
   * Returns element role for focusable elements (matches TabOverlay getElementType).
   */
  function getElementRole(el) {
    const role = (el.getAttribute('role') || '').trim().toLowerCase();
    if (role) return role;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'button') return 'button';
    if (tag === 'a') return 'link';
    if (tag === 'input') {
      const t = (el.getAttribute('type') || 'text').toLowerCase();
      return t === 'submit' || t === 'button' ? 'button' : t === 'search' ? 'searchbox' : 'textbox';
    }
    if (tag === 'select') return 'listbox';
    if (tag === 'textarea') return 'textbox';
    return '';
  }

  /**
   * Returns a short element descriptor for static violations.
   */
  function getElementDescriptor(el) {
    if (!el) return '';
    const tag = (el.tagName || '').toLowerCase();
    const id = el.id ? '#' + el.id : '';
    const cls = el.className && typeof el.className === 'string' ? ('.' + el.className.trim().split(/\s+/)[0]) : '';
    return tag + id + (cls && cls !== '.' ? cls : '');
  }

  /**
   * Builds the accessibility snapshot for Export for Claude.
   * @param {Document} [doc]
   * @returns {Object} Snapshot ready for JSON serialization
   */
  function buildExportSnapshot(doc) {
    doc = doc || document;
    const issues = lastIssues.length ? lastIssues : getIssues(doc);
    const headings = lastHeadings.length ? lastHeadings : getHeadingsData(doc);
    const hasFocusVisibleIssue = issues.some((i) => i.rule === 'focus-visible');

    const getTabOrderFn = window.getTabOrder;
    const tabOrder = getTabOrderFn ? getTabOrderFn(doc) : [];
    const getAccessibleNameFn = window.getAccessibleName;

    const focusableElements = tabOrder.map(({ el, order }) => {
      const tabIdx = el.getAttribute('tabindex');
      const tabIndex = tabIdx != null ? parseInt(tabIdx, 10) : 0;
      const name = getAccessibleNameFn ? getAccessibleNameFn(el, doc) : (el.getAttribute('aria-label') || el.textContent || '').trim();
      const tag = (el.tagName || '').toLowerCase();
      return {
        tag,
        name: name || '',
        role: getElementRole(el),
        tabIndex,
        hasVisibleFocusIndicator: !hasFocusVisibleIssue,
      };
    });

    const images = Array.from(doc.querySelectorAll('img')).map((img) => {
      const alt = img.getAttribute('alt');
      const decorative = alt === '' || img.getAttribute('role') === 'presentation';
      return {
        src: (img.currentSrc || img.src || '').slice(0, 500),
        alt: alt != null ? alt : null,
        decorative: !!decorative,
      };
    });

    const formControls = doc.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), select, textarea');
    const forms = Array.from(formControls).map((el) => {
      const tag = (el.tagName || '').toLowerCase();
      const inputType = tag === 'input' ? (el.getAttribute('type') || 'text') : tag;
      const label = getAccessibleNameFn ? getAccessibleNameFn(el, doc) : null;
      const placeholder = el.getAttribute('placeholder') || null;
      return {
        inputType: tag === 'input' ? (el.getAttribute('type') || 'text') : tag,
        label: (label && label.trim()) || null,
        placeholder: placeholder || null,
      };
    });

    const RULES = window.A11Y_BARKER_RULES || {};
    const staticRuleViolations = issues.map((item) => {
      const meta = RULES[item.rule];
      return {
        rule: item.rule,
        element: getElementDescriptor(item.el),
        wcag: meta?.wcag || null,
      };
    });

    return {
      page: window.location.href,
      timestamp: new Date().toISOString(),
      headings: headings.map((h) => ({
        level: h.level,
        text: h.text,
        visible: window.A11yBarkerIsHeadingVisible ? window.A11yBarkerIsHeadingVisible(h.el) : true,
      })),
      landmarks: getLandmarksData(doc),
      focusableElements,
      images,
      forms,
      staticRuleViolations,
    };
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
   * Runs static rules, color contrast checks, and image health checks.
   * Returns all issues sorted by DOM order.
   *
   * @param {Document} [doc] - Document to analyze
   * @returns {Array<{el: Element, rule: string, message: string}>}
   */
  function getIssues(doc) {
    const rules = window.runStaticRules ? window.runStaticRules(doc) : [];
    const contrast = window.runColorContrast ? window.runColorContrast(doc) : [];
    const images = window.runImageHealth ? window.runImageHealth(doc) : [];
    const issues = [...rules, ...contrast, ...images];
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

    // Persist a lightweight scan summary so the popup can display it without DevTools.
    try {
      chrome.storage.local.set({
        a11yBarkerLastScan: {
          count: lastIssuesGrouped.length,
          url: window.location.hostname,
          timestamp: Date.now(),
        },
      });
    } catch (_) { /* storage write failure */ }
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
        case 'getExportSnapshot':
          try {
            const snapshot = buildExportSnapshot(document);
            reply(snapshot);
          } catch (e) {
            reply({ ok: false, error: e?.message || 'Export failed' });
          }
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

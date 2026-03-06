/**
 * Filename: overlay/coordinator.js
 * Purpose: Badge coordinator — centralizes positioning to prevent overlap. Receives badge data from
 *   tab, heading, ariaHidden, and issues overlays; groups by element; creates DOM nodes; positions
 *   them in a viewport-relative coordinate system stacked upward from each element's top edge.
 *
 *   Two-pass positioning:
 *   1. Each element's own badges are stacked upward from its top edge.
 *   2. A global collision pass resolves overlaps between badges from different elements
 *      (e.g. <h3><a> where both elements have badges at nearly the same rect.top).
 */
(function () {
  const BADGE_HEIGHT_PX = 22;
  const BADGE_WIDTH_PX = 120;
  const GAP_PX = 4;

  function createCoordinator() {
    const badgeEntriesByEl = new Map(); // el -> [{ badge, data, height, width }]

    return {
      update(allOverlayData) {
        const shadow = window.A11yBarkerOverlay?.shadow;
        if (!shadow) return;

        this.clear();
        if (!allOverlayData) return;

        const typeOrder = ['tab', 'heading', 'ariaHidden', 'issues'];
        const byElement = new Map(); // el -> [data, ...]

        function add(el, data) {
          if (!el?.isConnected) return;
          const list = byElement.get(el) || [];
          list.push(data);
          byElement.set(el, list);
        }

        (allOverlayData.tab || []).forEach((d) => add(d.el, { ...d, type: 'tab' }));
        (allOverlayData.heading || []).forEach((d) => add(d.el, { ...d, type: 'heading' }));
        (allOverlayData.ariaHidden || []).forEach((d) => add(d.el, { ...d, type: 'ariaHidden' }));
        (allOverlayData.issues || []).forEach((d) => add(d.el, { ...d, type: 'issues' }));

        byElement.forEach((dataList, el) => {
          dataList.sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type));
          const entries = [];
          dataList.forEach((data) => {
            const badge = createBadgeEl(data);
            shadow.appendChild(badge);

            // Force nowrap to measure natural width, then restore wrapping preference.
            const prevWS = badge.style.whiteSpace;
            badge.style.whiteSpace = 'nowrap';
            badge.style.width = Math.min(300, badge.scrollWidth || 0) + 'px';
            badge.style.whiteSpace = prevWS || (data.type === 'tab' ? 'pre-wrap' : 'normal');

            // Re-measure after final styles are applied (whiteSpace restored).
            // getBoundingClientRect forces reflow, so height reflects actual wrapped height.
            // offsetWidth is unreliable in shadow DOM, so width is also taken from here.
            const measured = badge.getBoundingClientRect();
            const height = measured.height || BADGE_HEIGHT_PX;
            const width = measured.width || BADGE_WIDTH_PX;
            entries.push({ badge, data, height, width });
          });
          badgeEntriesByEl.set(el, entries);
        });
      },

      positionBadges() {
        /*
         * Pass 1: position each element's badges stacked upward from its own rect.top.
         * Pass 2: global collision resolution — badges from different elements that overlap
         *   (common with nested elements like <h3><a>) are pushed upward until clear.
         *
         * placed[] accumulates all visible badges in DOM order for the collision pass.
         * Collision check is x-overlap first (cheap) then y-overlap, so orthogonal badges
         * (same y, different x columns) are left alone.
         */
        const vw = window.innerWidth || document.documentElement.clientWidth;
        const vh = window.innerHeight || document.documentElement.clientHeight;
        const pad = 4;

        const placed = []; // { badge, x, y, width, height } — mutable for collision pass

        // --- Pass 1: per-element stacking ---
        badgeEntriesByEl.forEach((entries, el) => {
          if (!el.isConnected) return;
          const rect = el.getBoundingClientRect();
          const notInView = !(window.A11yBarkerIsInViewport && window.A11yBarkerIsInViewport(rect));
          const n = entries.length;
          let offset = GAP_PX;
          for (let i = n - 1; i >= 0; i--) {
            const { badge, height, width } = entries[i];
            if (notInView) {
              badge.style.display = 'none';
              continue;
            }
            badge.style.display = '';
            let y = rect.top - offset - height;
            let x = rect.left;
            x = Math.max(pad, Math.min(x, vw - width - pad));
            y = Math.max(pad, Math.min(y, vh - height - pad));
            badge.style.transformOrigin = '0 0';
            badge.style.transform = `translate(${x}px, ${y}px)`;
            offset += height + GAP_PX;
            placed.push({ badge, x, y, width, height });
          }
        });

        // --- Pass 2: global collision resolution ---
        // For each badge, check all previously placed badges for overlap.
        // If overlapping, push the current badge upward until clear.
        // Only set changed when we actually move the badge (avoids infinite loop when
        // badges are clamped to viewport top and can't be pushed further).
        for (let i = 1; i < placed.length; i++) {
          const cur = placed[i];
          let changed = true;
          let iterations = 0;
          const maxIter = placed.length * 2;
          while (changed && iterations < maxIter) {
            iterations++;
            changed = false;
            for (let j = 0; j < i; j++) {
              const prev = placed[j];
              const xOverlap = cur.x < prev.x + prev.width + GAP_PX &&
                cur.x + cur.width + GAP_PX > prev.x;
              const yOverlap = cur.y < prev.y + prev.height + GAP_PX &&
                cur.y + cur.height + GAP_PX > prev.y;
              if (xOverlap && yOverlap) {
                const newY = Math.max(pad, prev.y - cur.height - GAP_PX);
                if (newY !== cur.y) {
                  cur.y = newY;
                  cur.badge.style.transform = `translate(${cur.x}px, ${cur.y}px)`;
                  changed = true;
                }
              }
            }
          }
        }
      },

      clear() {
        badgeEntriesByEl.forEach((entries) => {
          entries.forEach(({ badge }) => badge.remove());
        });
        badgeEntriesByEl.clear();
      },
    };
  }

  /**
   * Creates a badge DOM element from overlay data.
   * @param {Object} data - Badge data from overlay getBadgeData()
   * @param {string} [data.type] - 'tab' | 'heading' | 'ariaHidden' | 'issues'
   * @param {string} [data.label] - Single-line text when line1/line2 not used
   * @param {string} [data.line1] - First line of multi-line badge (tab)
   * @param {string} [data.line2] - Second line of multi-line badge (tab)
   * @param {string} [data.background] - CSS background color (default '#333')
   * @param {boolean} [data.isProblem] - If true, adds red outline (2px solid #912200)
   * @returns {HTMLSpanElement}
   */
  function createBadgeEl(data) {
    const badge = document.createElement('span');
    if (data.line1 !== undefined || data.line2 !== undefined) {
      badge.appendChild(document.createTextNode(data.line1 || ''));
      if (data.line2) {
        if (data.line1) badge.appendChild(document.createElement('br'));
        const span = document.createElement('span');
        span.style.fontWeight = 'normal';
        span.textContent = data.line2;
        badge.appendChild(span);
      }
    } else {
      badge.textContent = data.label || '';
    }
    badge.dataset.badgeType = data.type || '';
    const bg = data.background || '#333';
    const outline = data.isProblem ? '2px solid #912200' : 'none';
    Object.assign(badge.style, {
      position: 'absolute',
      display: 'block',
      left: '0',
      top: '0',
      willChange: 'transform',
      zIndex: String(window.A11yBarkerOverlayZ?.badgeTab ?? 2),
      padding: data.type === 'tab' || data.type === 'issues' ? '4px 8px' : '2px 6px',
      fontSize: '13px',
      fontWeight: 'bold',
      color: '#fff',
      background: bg,
      borderRadius: '4px',
      pointerEvents: 'none',
      outline,
      outlineOffset: '0',
      boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
      maxWidth: '300px',
      whiteSpace: data.type === 'tab' ? 'pre-wrap' : 'normal',
      wordBreak: 'break-word',
    });
    return badge;
  }

  window.A11yBarkerCoordinator = createCoordinator;
})();
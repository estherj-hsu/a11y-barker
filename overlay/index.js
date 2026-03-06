/**
 * Filename: overlay/index.js
 * Purpose: Shadow DOM overlay framework — host element, shadow root, show/hide. Exposes visibility
 *   helpers (A11yBarkerIsHeadingVisible, A11yBarkerIsInViewport) and A11yBarkerClamp for badge positioning.
 */
(function () {
  const HOST_ID = 'a11y-barker-overlay-host';

  window.A11yBarkerOverlayZ = {
    badgeAriaHidden: 0,
    badgeHeading: 1,
    badgeTab: 2,
    badgeIssues: 3,
    panel: 10,
  };

  /**
   * Checks if an element is visible to users. Uses checkVisibility (opacity, visibility),
   * walks up to exclude hidden ancestors, details:not([open]), and computed display/visibility.
   * @param {Element} el - Element to check
   * @returns {boolean}
   */
  window.A11yBarkerIsHeadingVisible = (el) => {
    if (!el?.isConnected) return false;
    try {
      if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    } catch (_) {}
    let node = el;
    while (node && node !== document.body) {
      if (node instanceof Element) {
        if (node.getAttribute?.('hidden') !== null) return false;
        if (node.closest?.('details:not([open])')) return false;
        const cs = window.getComputedStyle?.(node);
        if (cs) {
          if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        }
      }
      node = node.parentElement || node.parentNode;
    }
    return true;
  };

  /**
   * Checks if a rect intersects the viewport.
   * @param {DOMRect} rect - getBoundingClientRect result
   * @returns {boolean}
   */
  window.A11yBarkerIsInViewport = (rect) => {
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    return rect.right > 0 && rect.left < vw && rect.bottom > 0 && rect.top < vh;
  };

  /**
   * Clamps badge position to viewport. Anchor modes: 'top-left', 'top-right', 'bottom-left'.
   * Currently all overlays use 'bottom-left'. Returns { x, y, origin } for CSS transform.
   * @param {DOMRect} rect - Element's getBoundingClientRect
   * @param {string} anchor - 'top-left' | 'top-right' | 'bottom-left'
   * @param {number} [badgeW] - Badge width
   * @param {number} [badgeH] - Badge height
   * @returns {{ x: number, y: number, origin: string }}
   */
  window.A11yBarkerClamp = (rect, anchor, badgeW, badgeH) => {
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const pad = 4;
    const w = badgeW || 120;
    const h = badgeH || 36;
    let x = 0;
    let y = 0;
    if (anchor === 'top-left') {
      x = Math.max(pad, Math.min(rect.left, vw - w - pad));
      y = Math.max(pad, Math.min(rect.top - h - 4, vh - h - pad));
      if (y < pad) y = Math.min(rect.bottom + 4, vh - h - pad);
      return { x, y, origin: '0 0' };
    }
    if (anchor === 'top-right') {
      x = Math.max(w + pad, Math.min(rect.right, vw - pad));
      y = Math.max(pad, Math.min(rect.top - h - 4, vh - h - pad));
      if (y < pad) y = Math.min(rect.bottom + 4, vh - h - pad);
      return { x, y, origin: '100% 0' };
    }
    if (anchor === 'bottom-left') {
      x = Math.max(pad, Math.min(rect.left, vw - w - pad));
      y = rect.top + rect.height + 4;
      if (y + h > vh - pad) y = rect.top - h - 4;
      y = Math.max(pad, Math.min(y, vh - h - pad));
      return { x, y, origin: '0 0' };
    }
    return { x: rect.left, y: rect.top, origin: '0 0' };
  };

  function createHost() {
    let host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = HOST_ID;
      Object.assign(host.style, {
        position: 'fixed',
        left: '0',
        top: '0',
        width: '0',
        height: '0',
        pointerEvents: 'none',
        zIndex: 999999,
      });
      document.body.appendChild(host);
    }
    return host;
  }

  function ensureShadow(host) {
    if (!host.shadowRoot) {
      host.attachShadow({ mode: 'open' });
    }
    return host.shadowRoot;
  }

  window.A11yBarkerOverlay = {
    host: null,
    shadow: null,

    init() {
      this.host = createHost();
      this.shadow = ensureShadow(this.host);
      return this.shadow;
    },

    show() {
      if (!this.host) this.init();
      this.host.style.display = '';
    },

    hide() {
      if (this.host) this.host.style.display = 'none';
    },

    isVisible() {
      return this.host && this.host.style.display !== 'none';
    },
  };
})();

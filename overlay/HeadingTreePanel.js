/**
 * Filename: overlay/HeadingTreePanel.js
 * Purpose: Heading structure accordion — in-page panel fixed bottom-right. Opacity 0.9 default, 1 on hover.
 */
(function () {
  const PANEL_ID = 'a11y-barker-heading-tree-panel';

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function createHeadingTreePanel() {
    let expanded = false;
    let onHighlightFn = null;

    return {
      update(headings, problemElements, onHighlight) {
        onHighlightFn = onHighlight;
        const problems = problemElements || new Set();
        const shadow = window.A11yBarkerOverlay?.shadow;
        if (!shadow) return;

        let panel = shadow.getElementById(PANEL_ID);
        if (!panel) {
          panel = document.createElement('div');
          panel.id = PANEL_ID;
          Object.assign(panel.style, {
            position: 'fixed',
            right: '20px',
            bottom: '20px',
            width: '300px',
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '8px',
            boxShadow: '0 -2px 12px rgba(0,0,0,0.3)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: '12px',
            opacity: '0.9',
            transition: 'opacity 0.15s ease',
            pointerEvents: 'auto',
            overflow: 'hidden',
            zIndex: String(window.A11yBarkerOverlayZ?.panel ?? 10),
          });
          panel.addEventListener('mouseenter', () => { panel.style.opacity = '1'; });
          panel.addEventListener('mouseleave', () => { panel.style.opacity = '0.9'; });
          shadow.appendChild(panel);
        }

        const header = document.createElement('button');
        header.type = 'button';
        header.setAttribute('aria-expanded', 'false');
        header.setAttribute('aria-controls', PANEL_ID + '-content');
        header.id = PANEL_ID + '-header';
        header.style.cssText = 'width:100%;padding:10px 12px;background:#1c2230;border:none;border-bottom:1px solid #30363d;color:#e6edf3;font-weight:700;font-size:14px;text-align:left;cursor:pointer;display:flex;align-items:center;justify-content:space-between;';
        const countSpan = document.createElement('span');
        countSpan.style.cssText = 'font-weight:500;color:#7d8590;font-size:12px;';
        const arrowSpan = document.createElement('span');
        arrowSpan.style.cssText = 'font-size:10px;color:#7d8590;';
        header.appendChild(document.createTextNode('Heading structure '));
        header.appendChild(countSpan);
        header.appendChild(arrowSpan);

        const content = document.createElement('div');
        content.id = PANEL_ID + '-content';
        content.setAttribute('role', 'region');
        content.setAttribute('aria-labelledby', PANEL_ID + '-header');
        content.style.cssText = 'display:none;';

        const renderContent = () => {
          content.innerHTML = '';
          const n = headings?.length ?? 0;
          countSpan.textContent = n ? ` (${n})` : '';
          arrowSpan.textContent = expanded ? ' ▼' : ' ▶';
          if (!headings || headings.length === 0) {
            const empty = document.createElement('div');
            empty.style.cssText = 'padding:12px;color:#7d8590;font-size:12px;';
            empty.textContent = 'No headings found';
            content.appendChild(empty);
          } else {
            const INDENT_PX = 14;
            headings.forEach((item, i) => {
              const isProblem = problems.has(item.el);
              const indent = (item.level - 1) * INDENT_PX;
              const row = document.createElement('button');
              row.type = 'button';
              row.style.cssText = 'width:100%;padding:6px 12px;padding-left:' + (12 + indent) + 'px;border:none;border-left:3px solid transparent;background:transparent;color:#e6edf3;font-size:12px;text-align:left;cursor:pointer;display:flex;align-items:center;gap:8px;transition:background 0.1s,border-color 0.1s;';
              if (isProblem) {
                row.style.borderLeftColor = '#f85149';
                row.style.background = 'rgba(248,81,73,0.15)';
              }
              row.innerHTML = `<span style="flex-shrink:0;font-weight:700;color:${isProblem ? '#f85149' : '#f0b429'};min-width:24px;">H${item.level}</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(item.text || '(empty)')}</span>`;
              row.addEventListener('mouseenter', () => { row.style.background = isProblem ? 'rgba(248,81,73,0.25)' : '#21293a'; });
              row.addEventListener('mouseleave', () => { row.style.background = isProblem ? 'rgba(248,81,73,0.15)' : 'transparent'; });
              row.addEventListener('click', () => {
                if (onHighlightFn) onHighlightFn(i);
              });
              content.appendChild(row);
            });
          }
        };

        header.addEventListener('click', () => {
          expanded = !expanded;
          content.style.display = expanded ? 'block' : 'none';
          header.setAttribute('aria-expanded', String(expanded));
          arrowSpan.textContent = expanded ? ' ▼' : ' ▶';
        });

        renderContent();

        panel.innerHTML = '';
        panel.appendChild(header);
        panel.appendChild(content);
      },

      clear() {
        const shadow = window.A11yBarkerOverlay?.shadow;
        if (shadow) {
          const panel = shadow.getElementById(PANEL_ID);
          if (panel) panel.remove();
        }
      },
    };
  }

  window.A11yBarkerHeadingTreePanel = createHeadingTreePanel;
})();

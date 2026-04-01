/**
 * Filename: ai/headingChecker.js
 * Purpose: Collect page headings and build a prompt for AI heading-structure review.
 */
(function () {
  /**
   * Returns true if the element or any ancestor has aria-hidden="true".
   * Such headings are not exposed to screen readers and should be excluded.
   * @param {Element} el
   * @returns {boolean}
   */
  function isAriaHidden(el) {
    let node = el;
    while (node && node !== document.documentElement) {
      if (node.getAttribute('aria-hidden') === 'true') return true;
      node = node.parentElement;
    }
    return false;
  }

  /**
   * Returns true if the element matches the sr-only pattern:
   * visually hidden (1px box, overflow hidden) but still in the accessibility tree.
   * @param {Element} el
   * @returns {boolean}
   */
  function isSrOnly(el) {
    const style = window.getComputedStyle(el);
    return (
      parseFloat(style.width) <= 1 &&
      parseFloat(style.height) <= 1 &&
      style.overflow === 'hidden'
    );
  }

  /**
   * Determines whether a heading should be included in the analysis.
   * - Excludes headings in aria-hidden subtrees (not in accessibility tree).
   * - Keeps sr-only headings (visually hidden but screen-reader accessible).
   * - Uses checkVisibility for everything else to filter collapsed/hidden elements.
   * @param {Element} el
   * @returns {boolean}
   */
  function shouldIncludeHeading(el) {
    if (isAriaHidden(el)) return false;
    if (isSrOnly(el)) return true;
    if (typeof el.checkVisibility === 'function') {
      return el.checkVisibility({ checkVisibilityCSS: true });
    }
    return true;
  }

  /**
   * Collects heading data from the document, filtered to only accessible headings.
   * @param {Document} [doc]
   * @returns {Array<{ level: number, text: string, srOnly: boolean }>}
   */
  function collectHeadingData(doc) {
    doc = doc || document;
    return Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6'))
      .filter(shouldIncludeHeading)
      .map((el) => {
        const level = parseInt((el.tagName || '').replace(/^[hH]/, ''), 10);
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
        const srOnly = isSrOnly(el);
        return { level, text, srOnly };
      });
  }

  /**
   * Returns the filtered heading elements in document order.
   * Matches the same order as collectHeadingData — use for index-based highlighting.
   * @param {Document} [doc]
   * @returns {HTMLElement[]}
   */
  function listHeadingElements(doc) {
    doc = doc || document;
    return Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6')).filter(shouldIncludeHeading);
  }

  /**
   * Builds an AI prompt for heading structure review.
   * Returns a string that should be sent to the Claude API.
   * @param {Array<{ level: number, text: string, srOnly?: boolean }>} headings
   * @returns {string}
   */
  function buildPrompt(headings) {
    const lines = headings
      .map((h) => `H${h.level}: ${h.text || '(empty)'}${h.srOnly ? ' [sr-only]' : ''}`)
      .join('\n');

    const schema = [
      '{',
      '  "issues": [',
      '    { "description": "string", "wcag": "e.g. 1.3.1", "headingIndex": 1 }',
      '  ],',
      '  "recommendation": "string"',
      '}',
    ].join('\n');

    return [
      'You are an accessibility expert reviewing heading structure on a web page.',
      'Headings marked [sr-only] are visually hidden but available to screen readers — treat them as real headings.',
      'Headings inside aria-hidden regions are omitted from this list.',
      'Headings are numbered in order from top to bottom (line 1 = first heading in the list).',
      '',
      'Flag issues ONLY for the following:',
      '- Skipped levels: a heading jumps MORE than one level down from the previous heading (e.g. H1→H3, H2→H4). H2 followed by H3 is correct nesting — do NOT flag it.',
      '- Multiple H1 headings (more than one H1 that is not sr-only).',
      '- Empty or meaningless heading text (e.g. "(empty)", single punctuation, generic filler).',
      '- Vague text that does not describe section content (e.g. "Click here", "More", "Read more").',
      '- A heading used purely as a styled call-to-action or decorative label rather than a real section heading.',
      '',
      'Do NOT flag:',
      '- A heading level going back up (e.g. H3 → H2) — this is expected when starting a new section.',
      '- A section that has no subheadings.',
      '- H2 → H3 nesting under any circumstances.',
      '',
      'Respond with ONLY a single JSON object and nothing else.',
      '- No markdown, no code fences, no commentary before or after the JSON.',
      '- If there are no problems, use an empty array for "issues" and an empty string for "recommendation".',
      '- Each issue must include:',
      '  - "description": what is wrong and why (string)',
      '  - "wcag": the relevant criterion e.g. "1.3.1" (string)',
      '  - "headingIndex": 1-based line number of the heading that CAUSES the issue — for a level skip, report the child heading, not the parent (integer)',
      '- "recommendation" is a short actionable string summarising what to fix overall.',
      '',
      'Exact shape:',
      schema,
      '',
      'Headings:',
      lines,
    ].join('\n');
  }

  window.A11yBarkerHeadingChecker = { collectHeadingData, buildPrompt, listHeadingElements };
})();
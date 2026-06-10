/**
 * Filename: ai/altChecker.js
 * Purpose: Collect page images and build prompts for AI alt-text review.
 */
(function () {
  const CONTEXT_TAGS = new Set(['figure', 'a', 'p', 'li', 'td']);

  /**
   * @param {Document} doc
   * @returns {Array<{ src: string, alt: string|null, context: string }>}
   */
  function collectImageData(doc) {
    doc = doc || document;
    const out = [];
    doc.querySelectorAll('img').forEach((img) => {
      const src = (img.currentSrc || img.src || '').trim();
      if (!src || src.startsWith('data:')) return;

      let alt;
      if (!img.hasAttribute('alt')) {
        alt = null;
      } else if (img.getAttribute('alt') === '') {
        alt = '';
      } else {
        alt = img.getAttribute('alt');
      }

      let context = '';
      let el = img.parentElement;
      while (el) {
        const tag = (el.tagName || '').toLowerCase();
        if (CONTEXT_TAGS.has(tag)) {
          const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
          context = text.slice(0, 120);
          break;
        }
        el = el.parentElement;
      }

      out.push({ src, alt, context });
    });
    return out;
  }

  /**
   * Same image order as collectImageData (non–data-URL img elements only).
   * @param {Document} doc
   * @returns {HTMLImageElement[]}
   */
  function listAltCheckImages(doc) {
    doc = doc || document;
    const out = [];
    doc.querySelectorAll('img').forEach((img) => {
      const src = (img.currentSrc || img.src || '').trim();
      if (!src || src.startsWith('data:')) return;
      out.push(img);
    });
    return out;
  }

  /**
   * @param {Array<{ src: string, alt: string|null, context: string }>} images
   * @returns {string}
   */
  function buildPrompt(images) {
    const lines = images.map((img, i) => {
      const n = i + 1;
      const altDesc =
        img.alt === null
          ? '(alt attribute missing)'
          : img.alt === ''
            ? '(decorative: empty alt)'
            : JSON.stringify(img.alt);
      const ctx = img.context ? `Context: ${img.context}` : 'Context: (none)';
      return `Image ${n}:\n  src: ${img.src}\n  alt: ${altDesc}\n  ${ctx}`;
    });

    const schema = [
      '{',
      '  "images": [',
      '    {',
      '      "index": 1,',
      '      "status": "GOOD | TOO GENERIC | MISSING | DECORATIVE OK | DECORATIVE WRONG",',
      '      "reason": "brief reason"',
      '    }',
      '  ]',
      '}',
    ].join('\n');

    return [
      'You are an accessibility expert reviewing image alternative text on a web page.',
      'For each image below (in order), judge whether the alt text (or lack of it) is appropriate given the image URL and surrounding context.',
      '',
      'Respond with ONLY a single JSON object and nothing else.',
      '- No markdown, no code fences, no commentary before or after the JSON.',
      '- Include exactly one object in "images" per input image, same order, with "index" 1..N matching the image numbers below.',
      '- "status" must be exactly one of: GOOD, TOO GENERIC, MISSING, DECORATIVE OK, DECORATIVE WRONG',
      '  - MISSING: no alt attribute.',
      '  - DECORATIVE OK / DECORATIVE WRONG: empty alt (decorative).',
      '  - GOOD: specific and appropriate alt.',
      '  - TOO GENERIC: alt exists but is vague (e.g. "image", filename only).',
      '- "reason" is a short string for each image.',
      '',
      'Exact shape:',
      schema,
      '',
      'Images:',
      ...lines,
    ].join('\n');
  }

  /**
   * Build Claude vision content blocks (text + image interleaved).
   * @param {Array<{ src: string, alt: string|null, context: string }>} images
   * @param {Record<string, string>} base64Map  src → base64 jpeg string
   * @returns {Array<object>} Claude content block array
   */
  function buildVisionContent(images, base64Map) {
    const schema = [
      '{',
      '  "images": [',
      '    {',
      '      "index": 1,',
      '      "status": "GOOD | TOO GENERIC | MISSING | DECORATIVE OK | DECORATIVE WRONG",',
      '      "reason": "brief reason"',
      '    }',
      '  ]',
      '}',
    ].join('\n');

    const intro = [
      'You are an accessibility expert reviewing image alternative text on a web page.',
      'For each image you will see the alt metadata AND the actual image.',
      'Judge whether the alt text (or lack of it) accurately and specifically describes what the image shows.',
      '',
      'Respond with ONLY a single JSON object and nothing else.',
      '- No markdown, no code fences, no commentary before or after the JSON.',
      '- Include exactly one object in "images" per input image, same order, with "index" 1..N.',
      '- "status" must be exactly one of: GOOD, TOO GENERIC, MISSING, DECORATIVE OK, DECORATIVE WRONG',
      '  - MISSING: no alt attribute.',
      '  - DECORATIVE OK / DECORATIVE WRONG: empty alt — OK if truly decorative, WRONG if the image conveys meaning.',
      '  - GOOD: alt is specific, accurate, and matches the actual image content.',
      '  - TOO GENERIC: alt exists but is vague or does not match the image (e.g. wrong subject, wrong breed, "image", filename only).',
      '- "reason" is a short string for each image.',
      '',
      'Exact shape:',
      schema,
      '',
      'Images:',
    ].join('\n');

    const blocks = [{ type: 'text', text: intro }];

    images.forEach((img, i) => {
      const n = i + 1;
      const altDesc =
        img.alt === null
          ? '(alt attribute missing)'
          : img.alt === ''
            ? '(decorative: empty alt)'
            : JSON.stringify(img.alt);
      const ctx = img.context ? `Context: ${img.context}` : 'Context: (none)';
      blocks.push({ type: 'text', text: `Image ${n}:\n  alt: ${altDesc}\n  ${ctx}` });
      const b64 = base64Map[img.src];
      if (b64) {
        blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } });
      }
    });

    return blocks;
  }

  window.A11yBarkerAltChecker = { collectImageData, buildPrompt, buildVisionContent, listAltCheckImages };
})();

/**
 * Filename: analyzer/imageHealth.js
 * Purpose: Image file-size check. Flags images exceeding the size threshold (default 1 MB).
 *   Uses the Performance Resource Timing API — no extra network requests required.
 */
(function () {
  const SIZE_THRESHOLD_BYTES = 1024 * 1024;

  /**
   * Looks up the transferred size of an image URL from the browser's resource timing entries.
   * Returns 0 if the entry is not found (e.g. cached with no size info, or cross-origin).
   *
   * @param {string} src - Absolute or relative image URL
   * @returns {number} Size in bytes, or 0 if unknown
   */
  function getImageSize(src) {
    try {
      const entries = performance.getEntriesByType('resource');
      const entry = entries.find((e) => e.name === src || e.name === new URL(src, location.href).href);
      if (entry && (entry.transferSize > 0 || entry.encodedBodySize > 0)) {
        return entry.transferSize || entry.encodedBodySize || 0;
      }
    } catch (_) {}
    return 0;
  }

  /**
   * Formats a byte count as a human-readable string (e.g. "1.4 MB", "512 KB").
   *
   * @param {number} bytes
   * @returns {string}
   */
  function formatSize(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return bytes + ' B';
  }

  /**
   * Scans all <img> elements in the document and returns issues for images exceeding
   * the size threshold. Data URIs are skipped (size is already inline).
   *
   * @param {Document} [doc]
   * @param {number} [thresholdBytes] - Byte threshold (default: 1 MB)
   * @returns {Array<{rule: string, message: string, el: Element, size: number}>}
   */
  function runImageHealth(doc, thresholdBytes) {
    doc = doc || document;
    thresholdBytes = thresholdBytes || SIZE_THRESHOLD_BYTES;
    const issues = [];

    doc.querySelectorAll('img').forEach((el) => {
      const src = el.currentSrc || el.src;
      if (!src || src.startsWith('data:')) return;

      const size = getImageSize(src);
      if (size > 0 && size > thresholdBytes) {
        issues.push({
          rule: 'image-large',
          message: 'Large image: ' + formatSize(size),
          el,
          size,
        });
      }
    });

    return issues;
  }

  window.runImageHealth = runImageHealth;
})();

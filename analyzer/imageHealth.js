/**
 * 圖片健康檢查：file size warning（超過閾值標注）
 * 使用 Performance API，不需要額外 request
 */
(function () {
  const SIZE_THRESHOLD_BYTES = 1024 * 1024;

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

  function formatSize(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return bytes + ' B';
  }

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

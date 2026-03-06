/**
 * Filename: rules-registry.js
 * Purpose: Registry of accessibility rules with WCAG 2.1 mapping. Each rule entry has: label, wcag
 *   (criterion ID or null), level ('A'|'AA'|'best-practice'), impact, description, helpUrl.
 */
window.A11Y_BARKER_RULES = {
  'missing-alt': {
    label: 'Missing Image Alt',
    wcag: '1.1.1',
    level: 'A',
    impact: 'critical',
    description: 'Non-text content must have a text alternative.',
    helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/non-text-content',
  },
  'empty-control': {
    label: 'Empty Button or Link',
    wcag: '4.1.2',
    level: 'A',
    impact: 'critical',
    description: 'Interactive elements must have an accessible name.',
    helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/name-role-value',
  },
  'tabindex-positive': {
    label: 'Positive Tabindex',
    wcag: '2.4.3',
    level: 'A',
    impact: 'serious',
    description: 'Focus order must preserve meaning; positive tabindex can break natural order.',
    helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/focus-order',
  },
  'duplicate-landmark': {
    label: 'Duplicate Landmark',
    wcag: '1.3.1',
    level: 'A',
    impact: 'moderate',
    description: 'Multiple landmarks of the same type should have distinguishing labels.',
    helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships',
  },
  'heading-skip': {
    label: 'Heading Hierarchy Issue',
    wcag: '1.3.1',
    level: 'A',
    impact: 'serious',
    description: 'Headings must not skip levels (e.g. H1 to H3).',
    helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships',
  },
  // Not a WCAG criterion — performance best practice for slow connections
  'image-large': {
    label: 'Large Image',
    wcag: null,
    level: 'best-practice',
    impact: 'moderate',
    description: 'Large image files may affect load time for users on slow connections.',
    helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/',
  },
  'input-label-missing': {
    label: 'Missing Input Label',
    wcag: '1.3.1',
    level: 'A',
    impact: 'critical',
    description: 'Form inputs must have an associated label.',
    helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/labels-or-instructions',
  },
  'link-ambiguous': {
    label: 'Ambiguous Link Text',
    wcag: '2.4.4',
    level: 'A',
    impact: 'serious',
    description: 'Link purpose must be determinable from the link text or context.',
    helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/link-purpose-in-context',
  },
  'lang-missing': {
    label: 'Missing Page Language',
    wcag: '3.1.1',
    level: 'A',
    impact: 'serious',
    description: 'The page language must be declared so assistive technologies can use the correct language profile.',
    helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/language-of-page',
  },
  // Maps to WCAG 2.4.7 (AA). WCAG 2.2 adds 2.4.11 (Focus Appearance, AA) — future consideration
  'focus-visible': {
    label: 'Missing Focus Indicator',
    wcag: '2.4.7',
    level: 'AA',
    impact: 'serious',
    description: 'Keyboard focus must be visually indicated.',
    helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/focus-visible',
  },
};

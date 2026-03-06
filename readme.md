# A11y Barker

A Chrome DevTools extension for visualizing accessibility on any webpage.

Tifa the golden retriever judges your markup. She's happy when your page is clean, sad when it's not, and judgemental when she's waiting.

---

## Features

### Overlay Visualization

| Feature | Description |
|---|---|
| Tab order | Numbers each focusable element in keyboard navigation order |
| SR content | Displays computed accessible name and role for interactive elements |
| Heading structure | Labels every h1–h6; tree panel shows full hierarchy |
| aria-hidden | Outlines hidden elements with a dashed border |
| Issues | Highlights elements with accessibility violations directly on the page |

### Static Rule Checks

| Rule | WCAG | Level |
|---|---|---|
| Missing image alt | 1.1.1 | A |
| Empty button or link | 4.1.2 | A |
| Missing input label | 1.3.1 / 4.1.2 | A |
| Positive tabindex | 2.4.3 | A |
| Duplicate landmark (unlabeled) | 1.3.1 | A |
| Heading hierarchy skip | 1.3.1 | A |
| Ambiguous link text | 2.4.4 | A |
| Missing page language | 3.1.1 | A |
| Focus outline removed | 2.4.7 | AA |
| Large image (>1MB) | — | Best practice |

### SPA Support

MutationObserver watches for DOM and attribute changes (`hidden`, `aria-hidden`, `style`, `class`) and re-runs analysis automatically. Overlays stay accurate after dropdowns open, modals appear, or route changes occur.

---

## Planned

- **AI alt text checker** — user-supplied API key; analyzes alt quality and suggests improvements
- **AI heading structure review** — sends heading tree to AI for semantic analysis beyond what static checks can catch
- **Export report** — download issues as JSON or HTML

---

## Architecture

```
a11y-barker/
├── manifest.json               # Manifest V3
├── background.js               # Service worker — AI API relay
├── content.js                  # Main logic: DOM analysis + overlay orchestration
├── rules-registry.js           # WCAG metadata for all rules
├── panel.html / panel.js       # DevTools panel UI
├── devtools.html / devtools.js # DevTools panel registration
├── utils/
│   └── dom.js                  # Shared DOM utilities (grouping, sorting)
├── overlay/
│   ├── index.js                # Shadow DOM host + shared helpers
│   ├── coordinator.js          # Centralizes badge positioning, prevents overlap
│   ├── TabOverlay.js           # Tab order + SR content badge data
│   ├── HeadingOverlay.js       # Heading badge data
│   ├── AriaHiddenOverlay.js    # aria-hidden badge data + outline style
│   ├── IssuesOverlay.js        # Fallback issue badges for uncovered elements
│   └── HeadingTreePanel.js     # Fixed heading tree panel (bottom-right)
├── analyzer/
│   ├── tabOrder.js             # Focusable element ordering
│   ├── srContent.js            # Accessible name computation (simplified accname)
│   ├── staticRules.js          # All static rule checks
│   └── imageHealth.js          # Image file size check via Performance API
├── ai/
│   └── altChecker.js           # Claude API integration (TODO)
├── popup/
│   ├── popup.html
│   └── popup.js
└── assets/
    └── dog/                    # Tifa SVG assets
```

---

## Key Design Decisions

**Shadow DOM isolation**
All overlay badges live inside a Shadow DOM host. Page styles cannot bleed in, and overlay styles cannot affect the inspected page.

**Badge coordinator**
A single coordinator collects badge data from all overlay types, groups by element, and stacks badges vertically to prevent overlap. Actual badge height is measured after DOM insertion so stacking is pixel-accurate.

**Issues as coloring, with fallback**
When an element has an issue, its existing badge (tab, heading, aria-hidden) turns red. If no other overlay is active for that element, a standalone red issue badge is rendered instead. Issues toggle works independently of other overlays.

**AI calls via background.js**
Routing AI requests through the service worker avoids CORS. The API key is stored in `chrome.storage.local` and never sent to any backend other than the AI provider directly.

**Performance API for image size**
Image file sizes are read from `performance.getEntriesByType('resource')` — no extra network request needed.

**AI checks are manual**
Alt text quality analysis is triggered explicitly by the user to avoid unintended API usage and cost.

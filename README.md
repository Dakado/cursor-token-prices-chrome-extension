# Cursor Token Prices Chrome Extension

Shows the actual API costs on the Cursor Usage page – even when included in your current plan. Costs appear as inline text in the usage table and update automatically when day filters are applied.

<img width="986" height="1053" alt="image" src="https://github.com/user-attachments/assets/c5f95548-41bd-48e2-9874-6d4f2a2391ed" />

## How it works

`inject.js` runs at `document_start` in the page's own JavaScript context (Manifest V3 `"world": "MAIN"`) and patches `fetch` and `XMLHttpRequest` before any page scripts load. Every call to the Cursor usage API is intercepted, parsed, and forwarded to `content.js` via a `CustomEvent`. On each new response (initial load or filter change) the existing cost annotations are removed and re-rendered from scratch.

## Installation

1. Clone this repo
2. `chrome://extensions/` → enable **Developer mode** → **Load unpacked** → select the project folder
3. Open [cursor.com/dashboard?tab=usage](https://cursor.com/dashboard?tab=usage)

After code changes: reload on `chrome://extensions/` (🔄), then `Cmd+Shift+R` / `Ctrl+Shift+R` on the usage page.

## Debugging

```javascript
// In DevTools Console on the usage page:
window.__cursorUsageData
```

## License

MIT

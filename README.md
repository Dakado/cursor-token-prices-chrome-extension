# Cursor Token Prices Chrome Extension

## Fix for Non-Auto (Default) Model Pricing

This fork fixes a bug where API costs were incorrectly calculated for models using the "default" price model. The original extension only displayed base token costs, but missed the additional API fee that applies to non-auto models.

**What was fixed:**
- When the price model is "default" (not "auto"), an additional API fee of $0.25 per 1 million tokens is now correctly added to the total cost
- The calculation now sums all token types (input, output, cache read, cache write) and adds the appropriate API fee
- This ensures accurate pricing display for all model types on the Cursor Usage page

Shows the actual API costs on the Cursor Usage page – even when included in your current plan. Costs appear as inline text in the usage table and update automatically when day filters are applied.

<img width="976" height="661" alt="image" src="https://github.com/user-attachments/assets/e104ff3c-989a-4e73-b608-28515aa8c71d" />

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

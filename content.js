// Cursor Token Prices Extension - Displays API costs in the Cursor usage table
(function () {
  'use strict';

  const store = { events: [] };
  let assignedEvents = new Set();
  let processedRows = new Set();
  let observer = null;
  let retryInterval = null;

  const formatCents = (cents) => {
    if (cents == null) return '-';
    if (cents === 0) return '$0.00';
    const dollars = cents / 100;
    return dollars < 0.01 ? `$${dollars.toFixed(3)}` : `$${dollars.toFixed(2)}`;
  };

  const getRowId = (row, index) => {
    const ts = row.querySelector('[title*="Feb"], [title*="Jan"], [title*="2026"]');
    if (ts) return ts.getAttribute('title') || ts.textContent;
    const text = row.textContent?.substring(0, 100);
    return text ? `${index}-${text}` : null;
  };

  const findMatchingEvent = (rowText, rowIndex) => {
    if (!store.events.length) return null;

    // Match by position (both sorted newest first)
    if (rowIndex > 0 && rowIndex <= store.events.length) {
      const ev = store.events[rowIndex - 1];
      if (ev && !assignedEvents.has(ev.timestamp)) {
        assignedEvents.add(ev.timestamp);
        return ev;
      }
    }

    // Fallback: match by model
    const match = rowText.match(/(kimi-k2\.5|gpt-5\.3-codex[^\s]*|claude-4\.6-opus[^\s]*|composer-1[^\s]*|auto)/i);
    const rowModel = match?.[1].toLowerCase();

    if (rowModel) {
      for (const ev of store.events) {
        if ((ev.model || '').toLowerCase().includes(rowModel) && !assignedEvents.has(ev.timestamp)) {
          assignedEvents.add(ev.timestamp);
          return ev;
        }
      }
    }

    // Last resort: first unassigned
    for (const ev of store.events) {
      if (!assignedEvents.has(ev.timestamp)) {
        assignedEvents.add(ev.timestamp);
        return ev;
      }
    }
    return null;
  };

  const injectIntoTable = () => {
    if (!store.events.length) return;

    document
      .querySelectorAll('.dashboard-table-rows, [role="rowgroup"], .dashboard-table-container')
      .forEach((container) => {
        container.querySelectorAll('[role="row"], .dashboard-table-row').forEach((row, idx) => {
          if (row.querySelector('[role="columnheader"], .dashboard-table-header')) return;

          const rowId = getRowId(row, idx);
          if (!rowId || processedRows.has(rowId)) return;

          const ev = findMatchingEvent(row.textContent || '', idx);
          if (!ev) return;

          const tokenUsage = ev.tokenUsage;
          if (!tokenUsage) return;
          const cost = tokenUsage.totalCents ?? 0;

          const cells = row.querySelectorAll('[role="cell"], .dashboard-table-cell');
          const costCell = cells[cells.length - 1];
          if (!costCell || costCell.querySelector('.cursor-cost-inline')) return;

          const badge = document.createElement('span');
          badge.className = 'cursor-cost-inline';
          badge.textContent = formatCents(cost);

          const parts = [];
          if (tokenUsage.inputTokens != null) parts.push(`Input: ${tokenUsage.inputTokens.toLocaleString()}`);
          if (tokenUsage.outputTokens != null) parts.push(`Output: ${tokenUsage.outputTokens.toLocaleString()}`);
          if (tokenUsage.cacheReadTokens != null) parts.push(`Cache read: ${tokenUsage.cacheReadTokens.toLocaleString()}`);
          if (tokenUsage.cacheWriteTokens != null) parts.push(`Cache write: ${tokenUsage.cacheWriteTokens.toLocaleString()}`);
          if (parts.length) badge.title = parts.join('\n');

          costCell.appendChild(badge);
          processedRows.add(rowId);
        });
      });
  };

  const resetState = () => {
    assignedEvents = new Set();
    processedRows = new Set();
    document.querySelectorAll('.cursor-cost-inline').forEach((el) => el.remove());
  };

  const watchForTableChanges = () => {
    injectIntoTable();

    if (!observer) {
      observer = new MutationObserver((mutations) => {
        const shouldInject = mutations.some((m) =>
          Array.from(m.addedNodes).some(
            (n) =>
              n.nodeType === Node.ELEMENT_NODE &&
              (n.matches?.('[role="row"], .dashboard-table-row') ||
                n.querySelector?.('[role="row"], .dashboard-table-row'))
          )
        );
        if (shouldInject) injectIntoTable();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    if (retryInterval) clearInterval(retryInterval);
    let attempts = 0;
    retryInterval = setInterval(() => {
      injectIntoTable();
      if (++attempts >= 10) clearInterval(retryInterval);
    }, 500);
  };

  const processApiResponse = (data) => {
    if (!data || typeof data !== 'object') return;

    const events = data.events || data.usageEventsDisplay || [];
    if (!events.length) return;

    resetState();
    store.events = events;

    watchForTableChanges();
  };

  // Initialize
  window.addEventListener('cursor-usage-data', (e) => processApiResponse(e.detail));

  if (window.__cursorUsageData?.events?.length) {
    processApiResponse(window.__cursorUsageData);
    return;
  }

  const interval = setInterval(() => {
    if (window.__cursorUsageData?.events?.length) {
      processApiResponse(window.__cursorUsageData);
      clearInterval(interval);
    }
  }, 500);

  setTimeout(() => clearInterval(interval), 30000);
})();

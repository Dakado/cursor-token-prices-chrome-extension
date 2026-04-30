// Cursor Token Prices Extension - Displays API costs in the Cursor usage table
(function () {
  'use strict';

  const store = { events: [], billingDate: null };
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

  const parseBillingDate = () => {
    // Extract billing date from "Resets May 13, 2026" text
    const resetElement = document.querySelector('[data-tooltip-content*="UTC"]');
    if (resetElement) {
      const tooltipContent = resetElement.getAttribute('data-tooltip-content');
      if (tooltipContent) {
        const match = tooltipContent.match(/(\w+), (\d+) (\w+) (\d+)/);
        if (match) {
          return new Date(match[0]);
        }
      }
    }
    // Fallback: look for "Resets" text
    const resetsText = Array.from(document.querySelectorAll('div')).find(el => 
      el.textContent?.includes('Resets') && el.textContent?.includes('20')
    );
    if (resetsText) {
      const match = resetsText.textContent.match(/Resets (\w+ \d+, \d+)/);
      if (match) {
        return new Date(match[1]);
      }
    }
    return null;
  };

  const isInCurrentBillingMonth = (eventDate, billingDate) => {
    if (!billingDate) return true;
    
    const now = new Date();
    const billingDay = billingDate.getDate();
    
    // Calculate current billing cycle start
    let cycleStart = new Date(now.getFullYear(), now.getMonth(), billingDay);
    if (now < cycleStart) {
      cycleStart = new Date(now.getFullYear(), now.getMonth() - 1, billingDay);
    }
    
    // Calculate next billing cycle start
    let nextCycleStart = new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, billingDay);
    
    // Check if event is within current billing cycle
    return eventDate >= cycleStart && eventDate < nextCycleStart;
  };

  const calculateMonthlyUsage = () => {
    if (!store.events.length) return { total: 0, count: 0 };
    
    const billingDate = store.billingDate || parseBillingDate();
    if (billingDate) store.billingDate = billingDate;
    
    let totalCents = 0;
    let requestCount = 0;
    
    for (const event of store.events) {
      const eventDate = new Date(event.timestamp);
      if (isInCurrentBillingMonth(eventDate, billingDate)) {
        // Calculate base cost
        let cost = event.tokenUsage?.totalCents || 0;
        
        // Add API fee for non-default models: $0.25 per 1 million tokens
        const model = (event.model || '').toLowerCase();
        if (model !== 'default' && model !== '') {
          const tokenUsage = event.tokenUsage;
          if (tokenUsage) {
            const totalTokens = 
              (tokenUsage.inputTokens || 0) + 
              (tokenUsage.outputTokens || 0) + 
              (tokenUsage.cacheReadTokens || 0) + 
              (tokenUsage.cacheWriteTokens || 0);
            const apiFeeCents = (totalTokens / 1000000) * 25;
            cost += apiFeeCents;
          }
        }
        
        totalCents += cost;
        requestCount++;
      }
    }
    
    return { total: totalCents, count: requestCount };
  };

  const injectMonthlyUsagePanel = () => {
    // Check if panel already exists
    if (document.querySelector('.monthly-usage-panel')) return;
    
    const { total, count } = calculateMonthlyUsage();
    
    // Find the container with the usage panels
    const usageContainer = document.querySelector('.flex.flex-wrap.gap-6');
    if (!usageContainer) return;
    
    const billingDate = store.billingDate || parseBillingDate();
    const resetDateStr = billingDate 
      ? `Resets ${billingDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
      : 'Resets next cycle';
    
    const panel = document.createElement('div');
    panel.className = 'monthly-usage-panel rounded-[12px] bg-elevated shadow-[0_0_0_1px_var(--border-quaternary)] flex min-w-0 flex-1 basis-[300px] flex-col gap-4 p-4 w-full col-span-1 md:col-span-6 lg:col-span-12';
    panel.style.width = '100%';
    
    panel.innerHTML = `
      <div class="flex w-full min-w-0 flex-col gap-2">
        <div class="text-base font-medium opacity-50">Total Monthly Usage</div>
        <div class="flex w-full min-w-0 items-baseline gap-1.5 overflow-hidden">
          <div class="text-xl flex-shrink-0 font-medium">${formatCents(total)}</div>
          <div class="text-xl text-tertiary truncate font-medium">(${count} requests)</div>
        </div>
        <div class="flex h-1 w-full gap-px ">
          <div class="bg-[var(--color-dashboard-usage-accent)]" style="width: 100%; height: 4px; border-radius: 1px;"></div>
          <div class="flex-grow bg-[var(--color-dashboard-usage-accent-10)]" style="height: 4px;"></div>
        </div>
      </div>
      <div class="text-base text-tertiary">
        <div class="flex items-center gap-1">
          ${resetDateStr}
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info h-3 w-3 cursor-help" aria-hidden="true">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 16v-4"></path>
            <path d="M12 8h.01"></path>
          </svg>
        </div>
      </div>
    `;
    
    // Insert after the existing usage panels
    usageContainer.appendChild(panel);
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
          
          // Calculate base cost
          let cost = tokenUsage.totalCents ?? 0;
          
          // Add API fee when price model is not default: $0.25 per 1 million tokens
          const model = (ev.model || '').toLowerCase();
          if (model !== 'default' && model !== '') {
            const totalTokens = 
              (tokenUsage.inputTokens || 0) + 
              (tokenUsage.outputTokens || 0) + 
              (tokenUsage.cacheReadTokens || 0) + 
              (tokenUsage.cacheWriteTokens || 0);
            const apiFeeCents = (totalTokens / 1000000) * 25; // $0.25 = 25 cents per 1M tokens
            cost += apiFeeCents;
          }

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
    injectMonthlyUsagePanel();

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
        if (shouldInject) {
          injectIntoTable();
          injectMonthlyUsagePanel();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    if (retryInterval) clearInterval(retryInterval);
    let attempts = 0;
    retryInterval = setInterval(() => {
      injectIntoTable();
      injectMonthlyUsagePanel();
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

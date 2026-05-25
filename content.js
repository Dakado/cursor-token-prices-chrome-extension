// Cursor Token Prices Extension - Displays API costs in the Cursor usage table
(function () {
  'use strict';

  const store = { events: [], billingDate: null, usageSummary: null };
  let observer = null;
  let retryInterval = null;
  
  const formatCents = (cents) => {
    if (cents == null) return '-';
    if (cents === 0) return '$0.00';
    const dollars = cents / 100;
    return dollars < 0.01 ? `$${dollars.toFixed(3)}` : `$${dollars.toFixed(2)}`;
  };

  const fetchUsageSummary = async () => {
    try {
      const response = await fetch('/api/usage-summary');
      if (!response.ok) throw new Error('Failed to fetch usage summary');
      const data = await response.json();
      store.usageSummary = data;
      
      // Extract billing cycle end date
      if (data.billingCycleEnd) {
        store.billingDate = new Date(data.billingCycleEnd);
      }
      
      console.log('Usage summary fetched:', data);
      return data;
    } catch (error) {
      console.error('Error fetching usage summary:', error);
      return null;
    }
  };

  const getMonthlyUsageFromSummary = () => {
    if (!store.usageSummary) return { total: 0, count: 0, percentUsed: 0 };
    
    const summary = store.usageSummary;
    const individualUsage = summary.individualUsage?.plan;
    
    if (!individualUsage) return { total: 0, count: 0, percentUsed: 0 };
    
    // The breakdown.total includes included + bonus tokens (in dollars * 100)
    // From the example: breakdown.total = 5903 means $59.03
    const totalCents = individualUsage.breakdown?.total || 0;
    const percentUsed = individualUsage.totalPercentUsed || 0;
    
    return { total: totalCents, count: 0, percentUsed: percentUsed };
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

  const parseTableDate = (dateStr, year) => {
    // Parse date format like "Apr 30, 07:50 AM" to Date object
    if (!dateStr) return null;
    
    try {
      // Match patterns like "Apr 30, 07:50 AM" or "Apr 30, 07:50 AM GMT+2"
      const match = dateStr.match(/(\w+)\s+(\d+),\s+(\d+):(\d+)\s*(AM|PM)/i);
      if (!match) return null;
      
      const [, monthName, day, hour, minute, ampm] = match;
      const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
      const month = months[monthName.toLowerCase().slice(0, 3)];
      
      if (month === undefined) return null;
      
      let hours = parseInt(hour, 10);
      if (ampm.toUpperCase() === 'PM' && hours !== 12) hours += 12;
      if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
      
      const currentYear = year || new Date().getFullYear();
      return new Date(currentYear, month, parseInt(day, 10), hours, parseInt(minute, 10));
    } catch (e) {
      return null;
    }
  };

  const calculateMonthlyUsage = () => {
    if (!store.events.length) {
      console.log('No events in store');
      return { total: 0, count: 0 };
    }
    
    console.log('Processing', store.events.length, 'events');
    
    const billingDate = store.billingDate || parseBillingDate();
    if (billingDate && !isNaN(billingDate.getTime())) store.billingDate = billingDate;
    
    console.log('Billing date:', billingDate);
    
    let totalCents = 0;
    let requestCount = 0;
    let skippedCount = 0;
    let matchedCount = 0;
    
    for (const event of store.events) {
      let eventDate = null;
      
      // Try to parse timestamp from event (convert string to number if needed)
      if (event.timestamp) {
        const ts = typeof event.timestamp === 'string' ? parseInt(event.timestamp, 10) : event.timestamp;
        eventDate = new Date(ts);
      }
      
      // If timestamp is invalid or missing, try to parse from displayDate
      if (!eventDate || isNaN(eventDate.getTime())) {
        if (event.displayDate) {
          const year = billingDate ? billingDate.getFullYear() : new Date().getFullYear();
          eventDate = parseTableDate(event.displayDate, year);
        }
      }
      
      // Skip if we still can't get a valid date
      if (!eventDate || isNaN(eventDate.getTime())) {
        skippedCount++;
        if (skippedCount <= 3) {
          console.log('Skipping event - invalid date:', { timestamp: event.timestamp, displayDate: event.displayDate, parsedTimestamp: typeof event.timestamp === 'string' ? parseInt(event.timestamp, 10) : event.timestamp });
        }
        continue;
      }
      
      // Debug: log first few events to verify data
      if (requestCount < 3) {
        console.log('Event debug:', { 
          eventDate: eventDate.toISOString(), 
          billingDate: billingDate?.toISOString(),
          timestamp: event.timestamp,
          displayDate: event.displayDate,
          model: event.model,
          cost: event.tokenUsage?.totalCents
        });
      }
      
      if (isInCurrentBillingMonth(eventDate, billingDate)) {
        matchedCount++;
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
    
    console.log('Monthly usage calculated:', { totalCents, requestCount, matchedCount, skippedCount });
    return { total: totalCents, count: requestCount };
  };

  const injectMonthlyUsagePanel = () => {
    // Check if panel already exists
    if (document.querySelector('.monthly-usage-panel')) return;
    
    // Try to get usage from API summary first, fallback to table calculation
    let total = 0;
    let count = 0;
    let percentUsed = 0;
    
    const summaryData = getMonthlyUsageFromSummary();
    if (summaryData.total > 0) {
      total = summaryData.total;
      percentUsed = summaryData.percentUsed || 0;
      // We don't have request count from summary, so we still calculate it from events
      const eventCount = calculateMonthlyUsage();
      count = eventCount.count;
    } else {
      // Fallback to table calculation if summary not available
      const eventData = calculateMonthlyUsage();
      total = eventData.total;
      count = eventData.count;
    }
    
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
    
    // Calculate progress bar width based on percent used
    const progressBarWidth = Math.min(100, Math.max(0, percentUsed));
    
    panel.innerHTML = `
      <div class="flex w-full min-w-0 flex-col gap-2">
        <div class="text-base font-medium opacity-50">Total Monthly Usage</div>
        <div class="flex w-full min-w-0 items-baseline gap-1.5 overflow-hidden">
          <div class="text-xl flex-shrink-0 font-medium">${formatCents(total)}</div>
          <div class="text-xl text-tertiary truncate font-medium">(${count} requests)</div>
        </div>
        <div class="flex h-1 w-full gap-px ">
          <div class="bg-[var(--color-dashboard-usage-accent)]" style="width: ${progressBarWidth}%; height: 4px; border-radius: 1px;"></div>
          <div class="flex-grow bg-[var(--color-dashboard-usage-accent-10)]" style="height: 4px;"></div>
        </div>
      </div>
      <div class="text-base text-tertiary">
        <div class="flex items-center gap-1">
          ${percentUsed > 0 ? `${percentUsed.toFixed(1)}% of included usage used` : resetDateStr}
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

  const watchForTableChanges = () => {
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
          injectMonthlyUsagePanel();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    if (retryInterval) clearInterval(retryInterval);
    let attempts = 0;
    retryInterval = setInterval(() => {
      injectMonthlyUsagePanel();
      if (++attempts >= 10) clearInterval(retryInterval);
    }, 500);
  };

  const processApiResponse = (data) => {
    if (!data || typeof data !== 'object') return;

    const events = data.events || data.usageEventsDisplay || [];
    if (!events.length) return;

    store.events = events;

    watchForTableChanges();
  };

  // Initialize
  const init = async () => {
    // Fetch usage summary from API first
    await fetchUsageSummary();
    
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
  };
  
  init();
})();

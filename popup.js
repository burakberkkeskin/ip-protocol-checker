let currentStats = null;
let activeLookupIp = null;
let currentLanguage = 'en';
let messages = {};
let activeProtocolFilter = null; // Track active protocol filter ('v4', 'v6', or 'local')
let activeViewMode = 'grouped'; // 'grouped' or 'flat'
let activePartyFilter = 'all'; // 'all', 'first', or 'third'
let currentSortCol = 'count'; // 'count', 'domain', 'ip', 'protocol'
let currentSortDir = 'desc'; // 'asc' or 'desc'
let activeDomain = ''; // Hostname of the current active tab
let expandedDomains = new Set(); // Track expanded domains in grouped view

const LANGUAGE_STORAGE_KEY = 'ipvchecker.language';
const SUPPORTED_LANGUAGES = ['en', 'tr'];
const MIN_POPUP_WIDTH = 575;
const MAX_POPUP_WIDTH = 780;
const MIN_DOMAIN_WIDTH = 155;
const MAX_DOMAIN_WIDTH = 340;
const FIXED_COLUMN_WIDTH = 420;

document.addEventListener('DOMContentLoaded', async () => {
  const filterInput = document.getElementById('filter-input');
  const languageSelect = document.getElementById('language-select');
  const summaryContainer = document.getElementById('summary-container');
  const cardV4 = document.getElementById('card-v4');
  const cardV6 = document.getElementById('card-v6');
  const cardLocal = document.getElementById('card-local');
  const viewModeBtn = document.getElementById('view-mode-btn');
  const partyFilterBtn = document.getElementById('party-filter-btn');

  currentLanguage = getInitialLanguage();
  languageSelect.value = currentLanguage;
  await loadMessages(currentLanguage);
  applyTranslations();

  // Query active tab domain for 1st/3rd party distinction
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.url) {
      try {
        const url = new URL(tabs[0].url);
        activeDomain = url.hostname;
      } catch (e) {
        console.error('Failed to parse tab URL', e);
      }
    }
  });

  languageSelect.addEventListener('change', async () => {
    currentLanguage = languageSelect.value;
    localStorage.setItem(LANGUAGE_STORAGE_KEY, currentLanguage);
    await loadMessages(currentLanguage);
    applyTranslations();
    renderTable(currentStats, filterInput.value);
  });

  filterInput.addEventListener('input', () => {
    renderTable(currentStats, filterInput.value);
  });

  // Setup view mode toggling
  viewModeBtn.addEventListener('click', () => {
    activeViewMode = activeViewMode === 'grouped' ? 'flat' : 'grouped';
    document.getElementById('view-mode-icon').textContent = activeViewMode === 'grouped' ? '📁' : '📝';
    viewModeBtn.classList.toggle('active', activeViewMode === 'flat');
    renderTable(currentStats, filterInput.value);
  });

  // Setup party filter cycling: all -> first -> third -> all
  partyFilterBtn.addEventListener('click', () => {
    if (activePartyFilter === 'all') {
      activePartyFilter = 'first';
      partyFilterBtn.classList.add('active');
      document.getElementById('party-filter-icon').textContent = '🏠'; // Home icon for 1st party
    } else if (activePartyFilter === 'first') {
      activePartyFilter = 'third';
      partyFilterBtn.classList.add('active');
      document.getElementById('party-filter-icon').textContent = '☁️'; // Cloud icon for 3rd party
    } else {
      activePartyFilter = 'all';
      partyFilterBtn.classList.remove('active');
      document.getElementById('party-filter-icon').textContent = '🌐'; // Globe for all
    }
    renderTable(currentStats, filterInput.value);
  });

  const toggleFilter = (type) => {
    const card = document.getElementById(`card-${type}`);
    if (activeProtocolFilter === type) {
      activeProtocolFilter = null;
      card.classList.remove('active');
      card.setAttribute('aria-pressed', 'false');
      summaryContainer.classList.remove('has-active');
    } else {
      if (activeProtocolFilter) {
        const prevCard = document.getElementById(`card-${activeProtocolFilter}`);
        if (prevCard) {
          prevCard.classList.remove('active');
          prevCard.setAttribute('aria-pressed', 'false');
        }
      }
      activeProtocolFilter = type;
      card.classList.add('active');
      card.setAttribute('aria-pressed', 'true');
      summaryContainer.classList.add('has-active');
    }
    renderTable(currentStats, filterInput.value);
  };

  const setupCard = (cardEl, type) => {
    if (!cardEl) return;
    cardEl.addEventListener('click', () => toggleFilter(type));
    cardEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleFilter(type);
      }
    });
  };

  setupCard(cardV4, 'v4');
  setupCard(cardV6, 'v6');
  setupCard(cardLocal, 'local');

  const setupHeader = (id, column) => {
    const th = document.getElementById(id);
    if (!th) return;
    th.addEventListener('click', () => {
      if (currentSortCol === column) {
        currentSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        currentSortCol = column;
        currentSortDir = column === 'count' ? 'desc' : 'asc';
      }
      updateSortIndicators();
      renderTable(currentStats, filterInput.value);
    });

    th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        th.click();
      }
    });
  };

  const updateSortIndicators = () => {
    const cols = ['domain', 'ip', 'proto'];
    cols.forEach(col => {
      const indicator = document.getElementById(`sort-${col}`);
      if (!indicator) return;
      
      const colMap = { 'domain': 'domain', 'ip': 'ip', 'proto': 'protocol' };
      const targetCol = colMap[col];
      
      // Default / Count sort is shown as active desc/asc on domain column
      if (currentSortCol === 'count' && col === 'domain') {
        indicator.textContent = currentSortDir === 'desc' ? ' ▼' : ' ▲';
      } else if (currentSortCol === targetCol) {
        indicator.textContent = currentSortDir === 'asc' ? ' ▲' : ' ▼';
      } else {
        indicator.textContent = '';
      }
    });
  };

  setupHeader('th-domain', 'domain');
  setupHeader('th-ip', 'ip');
  setupHeader('th-proto', 'protocol');

  // Initial sort indicator render
  updateSortIndicators();

  chrome.runtime.sendMessage({ action: "getStats" }, (response) => {
    currentStats = response;
    updateSummary(response);
    renderTable(response, filterInput.value);
  });
});

function getInitialLanguage() {
  const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (SUPPORTED_LANGUAGES.includes(savedLanguage)) return savedLanguage;

  const browserLanguage = navigator.language?.slice(0, 2).toLowerCase();
  return SUPPORTED_LANGUAGES.includes(browserLanguage) ? browserLanguage : 'en';
}

async function loadMessages(language) {
  const response = await fetch(chrome.runtime.getURL(`locales/${language}.json`));
  messages = await response.json();
  document.documentElement.lang = language;
}

function translate(key) {
  return messages[key] || key;
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = translate(element.dataset.i18n);
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    element.placeholder = translate(element.dataset.i18nPlaceholder);
  });

  document.querySelectorAll('[data-i18n-title]').forEach((element) => {
    element.title = translate(element.dataset.i18nTitle);
  });
}

function getRootDomain(hostname) {
  if (!hostname) return '';
  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;
  const cctlds = ['co.uk', 'com.tr', 'org.uk', 'net.uk', 'gov.uk', 'edu.tr', 'co.jp', 'com.br', 'com.au', 'co.nz'];
  const lastTwo = parts.slice(-2).join('.');
  if (cctlds.includes(lastTwo) && parts.length > 2) {
    return parts.slice(-3).join('.');
  }
  return lastTwo;
}

function isFirstParty(requestDomain, activeDomain) {
  if (!activeDomain) return false;
  if (requestDomain === activeDomain) return true;
  const rootRequest = getRootDomain(requestDomain);
  const rootActive = getRootDomain(activeDomain);
  return rootRequest && rootActive && rootRequest === rootActive;
}

function updateSummary(stats) {
  const safeStats = stats || { v4: 0, v6: 0, local: 0 };
  const total = safeStats.v4 + safeStats.v6;

  updateCard('v4', safeStats.v4, total);
  updateCard('v6', safeStats.v6, total);
  updateCard('local', safeStats.local, total);
}

function updateCard(key, count, total) {
  const percent = total > 0 ? (count / total) * 100 : 0;
  const formattedPercent = `${percent.toFixed(1)}%`;

  document.getElementById(`count-${key}`).textContent = count;
  document.getElementById(`pct-${key}`).textContent = formattedPercent;
  document.getElementById(`bar-${key}`).style.width = formattedPercent;
}

function renderTable(stats, query = '') {
  const tbody = document.getElementById('domain-list');
  const domains = Object.entries(stats?.domains || {});

  if (domains.length === 0) {
    resizePopup([]);
    tbody.replaceChildren(createEmptyRow(translate('state.noRequests')));
    return;
  }

  const normalizedQuery = query.trim().toLowerCase();
  const allItems = [];

  // 1. Flatten and Filter connections
  for (const [domain, data] of domains) {
    const isFirstPartyConnection = isFirstParty(domain, activeDomain);
    const partyType = isFirstPartyConnection ? 'first' : 'third';

    // 1st / 3rd Party filter check
    if (activePartyFilter === 'first' && !isFirstPartyConnection) continue;
    if (activePartyFilter === 'third' && isFirstPartyConnection) continue;

    for (const [ip, ipData] of Object.entries(data.ips)) {
      // Protocol/Local filter control
      if (activeProtocolFilter) {
        if (activeProtocolFilter === 'v4' && ipData.type !== 'v4') continue;
        if (activeProtocolFilter === 'v6' && ipData.type !== 'v6') continue;
        if (activeProtocolFilter === 'local' && !ipData.local) continue;
      }

      // Query filter check
      if (normalizedQuery && !matchesQuery(domain, ip, ipData, normalizedQuery)) {
        continue;
      }

      allItems.push({
        domain,
        ip,
        ipData,
        isFirstParty: isFirstPartyConnection,
        partyType
      });
    }
  }

  const fragment = document.createDocumentFragment();
  let renderedRowsCount = 0;

  if (activeViewMode === 'flat') {
    // FLAT MODE
    // Sort items flat
    allItems.sort((a, b) => {
      let comparison = 0;
      if (currentSortCol === 'domain') {
        comparison = a.domain.localeCompare(b.domain);
      } else if (currentSortCol === 'ip') {
        comparison = a.ip.localeCompare(b.ip);
      } else if (currentSortCol === 'protocol') {
        const aProto = (a.ipData.type || '') + (a.ipData.local ? 'local' : '');
        const bProto = (b.ipData.type || '') + (b.ipData.local ? 'local' : '');
        comparison = aProto.localeCompare(bProto);
      } else { // 'count'
        comparison = a.ipData.count - b.ipData.count;
      }

      if (comparison === 0) comparison = a.ipData.count - b.ipData.count;
      if (comparison === 0) comparison = a.domain.localeCompare(b.domain);
      if (comparison === 0) comparison = a.ip.localeCompare(b.ip);

      return currentSortDir === 'desc' ? -comparison : comparison;
    });

    for (const item of allItems) {
      const tr = document.createElement('tr');
      // Accent border
      const protoClass = item.ipData.local ? 'proto-local' : `proto-${item.ipData.type}`;
      tr.className = protoClass;

      // Domain column
      const tdDomain = document.createElement('td');
      tdDomain.className = 'domain-col';
      const domainContent = document.createElement('div');
      domainContent.className = 'domain-content';
      
      const domainName = document.createElement('span');
      domainName.className = 'domain-name';
      domainName.textContent = item.domain;
      domainName.title = item.domain;

      const countSpan = document.createElement('span');
      countSpan.className = 'request-count';
      countSpan.textContent = `x${item.ipData.count}`;

      domainContent.appendChild(domainName);
      domainContent.appendChild(countSpan);
      tdDomain.appendChild(domainContent);

      // IP Column
      const tdIp = document.createElement('td');
      tdIp.className = 'ip-col';
      const ipButton = document.createElement('button');
      ipButton.className = 'ip-button';
      ipButton.type = 'button';
      ipButton.textContent = item.ip;
      ipButton.title = translate('lookup.buttonTitle');
      ipButton.addEventListener('click', () => showIpLookup(item.ip, tr));
      tdIp.appendChild(ipButton);

      // Protocol Column
      const tdProto = document.createElement('td');
      tdProto.className = 'proto-col';
      const typeSpan = document.createElement('span');
      typeSpan.className = `badge bg-${item.ipData.type}`;
      typeSpan.textContent = item.ipData.type.toUpperCase();
      tdProto.appendChild(typeSpan);
      if (item.ipData.local) {
        const localSpan = document.createElement('span');
        localSpan.className = 'badge bg-local';
        localSpan.textContent = 'LAN';
        tdProto.appendChild(localSpan);
      }

      tr.appendChild(tdDomain);
      tr.appendChild(tdIp);
      tr.appendChild(tdProto);
      fragment.appendChild(tr);
      renderedRowsCount++;
    }
  } else {
    // GROUPED MODE
    // Group connections by domain name
    const groupsMap = new Map();
    for (const item of allItems) {
      if (!groupsMap.has(item.domain)) {
        groupsMap.set(item.domain, {
          domain: item.domain,
          isFirstParty: item.isFirstParty,
          totalCount: 0,
          ips: [],
          hasV4: false,
          hasV6: false,
          hasLocal: false
        });
      }
      const group = groupsMap.get(item.domain);
      group.totalCount += item.ipData.count;
      group.ips.push({ ip: item.ip, ipData: item.ipData });
      if (item.ipData.type === 'v4') group.hasV4 = true;
      if (item.ipData.type === 'v6') group.hasV6 = true;
      if (item.ipData.local) group.hasLocal = true;
    }

    const groups = Array.from(groupsMap.values());
    
    // Sort child connections inside each domain by count descending
    groups.forEach(g => {
      g.ips.sort((a, b) => b.ipData.count - a.ipData.count);
    });

    // Sort grouped domains based on column selection
    groups.sort((a, b) => {
      let comparison = 0;
      if (currentSortCol === 'domain') {
        comparison = a.domain.localeCompare(b.domain);
      } else if (currentSortCol === 'ip') {
        const aFirstIp = a.ips[0]?.ip || '';
        const bFirstIp = b.ips[0]?.ip || '';
        comparison = aFirstIp.localeCompare(bFirstIp);
      } else if (currentSortCol === 'protocol') {
        const aProto = (a.hasV6 ? 'v6' : '') + (a.hasV4 ? 'v4' : '') + (a.hasLocal ? 'local' : '');
        const bProto = (b.hasV6 ? 'v6' : '') + (b.hasV4 ? 'v4' : '') + (b.hasLocal ? 'local' : '');
        comparison = aProto.localeCompare(bProto);
      } else { // 'count'
        comparison = a.totalCount - b.totalCount;
      }

      if (comparison === 0) comparison = a.totalCount - b.totalCount;
      if (comparison === 0) comparison = a.domain.localeCompare(b.domain);
      return currentSortDir === 'desc' ? -comparison : comparison;
    });

    for (const group of groups) {
      if (group.ips.length === 1) {
        // Single IP domain: render as standard flat row
        const item = group.ips[0];
        const tr = document.createElement('tr');
        const protoClass = item.ipData.local ? 'proto-local' : `proto-${item.ipData.type}`;
        tr.className = protoClass;

        // Domain column
        const tdDomain = document.createElement('td');
        tdDomain.className = 'domain-col';
        const domainContent = document.createElement('div');
        domainContent.className = 'domain-content';
        
        const domainName = document.createElement('span');
        domainName.className = 'domain-name';
        domainName.textContent = group.domain;
        domainName.title = group.domain;

        const countSpan = document.createElement('span');
        countSpan.className = 'request-count';
        countSpan.textContent = `x${group.totalCount}`;

        domainContent.appendChild(domainName);
        domainContent.appendChild(countSpan);
        tdDomain.appendChild(domainContent);

        // IP column
        const tdIp = document.createElement('td');
        tdIp.className = 'ip-col';
        const ipButton = document.createElement('button');
        ipButton.className = 'ip-button';
        ipButton.type = 'button';
        ipButton.textContent = item.ip;
        ipButton.title = translate('lookup.buttonTitle');
        ipButton.addEventListener('click', () => showIpLookup(item.ip, tr));
        tdIp.appendChild(ipButton);

        // Protocol column
        const tdProto = document.createElement('td');
        tdProto.className = 'proto-col';
        const typeSpan = document.createElement('span');
        typeSpan.className = `badge bg-${item.ipData.type}`;
        typeSpan.textContent = item.ipData.type.toUpperCase();
        tdProto.appendChild(typeSpan);
        if (item.ipData.local) {
          const localSpan = document.createElement('span');
          localSpan.className = 'badge bg-local';
          localSpan.textContent = 'LAN';
          tdProto.appendChild(localSpan);
        }

        tr.appendChild(tdDomain);
        tr.appendChild(tdIp);
        tr.appendChild(tdProto);
        fragment.appendChild(tr);
        renderedRowsCount++;
      } else {
        // Multiple IP domain: render parent row and collapsible child rows
        const parentTr = document.createElement('tr');
        parentTr.className = 'expandable proto-dual';
        const isExpanded = expandedDomains.has(group.domain);
        if (isExpanded) {
          parentTr.classList.add('expanded');
        }

        // Domain Column
        const tdDomain = document.createElement('td');
        tdDomain.className = 'domain-col';
        const domainContent = document.createElement('div');
        domainContent.className = 'domain-content';

        const arrowSpan = document.createElement('span');
        arrowSpan.className = 'expand-icon';
        arrowSpan.textContent = '▶';

        const domainName = document.createElement('span');
        domainName.className = 'domain-name';
        domainName.textContent = group.domain;
        domainName.title = group.domain;

        const countSpan = document.createElement('span');
        countSpan.className = 'request-count';
        countSpan.textContent = `x${group.totalCount}`;

        domainContent.appendChild(arrowSpan);
        domainContent.appendChild(domainName);
        domainContent.appendChild(countSpan);
        tdDomain.appendChild(domainContent);

        // IP Column
        const tdIp = document.createElement('td');
        tdIp.className = 'ip-col';
        tdIp.style.color = 'var(--muted)';
        tdIp.style.fontSize = '12px';
        tdIp.textContent = `${group.ips.length} IPs`;

        // Protocol Column
        const tdProto = document.createElement('td');
        tdProto.className = 'proto-col';
        
        // Show combined dual status if both v4 and v6 are active
        if (group.hasV4 && group.hasV6) {
          const dualSpan = document.createElement('span');
          dualSpan.className = 'party-badge dual-stack';
          dualSpan.textContent = translate('badge.dualStack');
          tdProto.appendChild(dualSpan);
        } else {
          if (group.hasV6) {
            const v6Span = document.createElement('span');
            v6Span.className = 'badge bg-v6';
            v6Span.textContent = 'V6';
            tdProto.appendChild(v6Span);
          }
          if (group.hasV4) {
            const v4Span = document.createElement('span');
            v4Span.className = 'badge bg-v4';
            v4Span.textContent = 'V4';
            tdProto.appendChild(v4Span);
          }
        }
        if (group.hasLocal) {
          const localSpan = document.createElement('span');
          localSpan.className = 'badge bg-local';
          localSpan.textContent = 'LAN';
          tdProto.appendChild(localSpan);
        }

        parentTr.appendChild(tdDomain);
        parentTr.appendChild(tdIp);
        parentTr.appendChild(tdProto);

        parentTr.addEventListener('click', (e) => {
          if (e.target.closest('.ip-button')) return;
          if (expandedDomains.has(group.domain)) {
            expandedDomains.delete(group.domain);
          } else {
            expandedDomains.add(group.domain);
          }
          const queryInput = document.getElementById('filter-input');
          renderTable(currentStats, queryInput ? queryInput.value : '');
        });

        fragment.appendChild(parentTr);
        renderedRowsCount++;

        // Render child rows
        for (const child of group.ips) {
          const childTr = document.createElement('tr');
          childTr.className = `child-row proto-${child.ipData.type}`;
          if (child.ipData.local) childTr.classList.add('proto-local');
          if (!isExpanded) {
            childTr.classList.add('hidden');
          }

          // Domain Column (empty/connector)
          const tdChildDomain = document.createElement('td');
          tdChildDomain.className = 'domain-col';
          
          const childDomainContent = document.createElement('div');
          childDomainContent.className = 'domain-content';
          
          const childCount = document.createElement('span');
          childCount.className = 'request-count';
          childCount.textContent = `x${child.ipData.count}`;
          
          childDomainContent.appendChild(childCount);
          tdChildDomain.appendChild(childDomainContent);

          // IP Column
          const tdChildIp = document.createElement('td');
          tdChildIp.className = 'ip-col';
          const ipButton = document.createElement('button');
          ipButton.className = 'ip-button';
          ipButton.type = 'button';
          ipButton.textContent = child.ip;
          ipButton.title = translate('lookup.buttonTitle');
          ipButton.addEventListener('click', () => showIpLookup(child.ip, childTr));
          tdChildIp.appendChild(ipButton);

          // Protocol Column
          const tdChildProto = document.createElement('td');
          tdChildProto.className = 'proto-col';
          const typeSpan = document.createElement('span');
          typeSpan.className = `badge bg-${child.ipData.type}`;
          typeSpan.textContent = child.ipData.type.toUpperCase();
          tdChildProto.appendChild(typeSpan);
          if (child.ipData.local) {
            const localSpan = document.createElement('span');
            localSpan.className = 'badge bg-local';
            localSpan.textContent = 'LAN';
            tdChildProto.appendChild(localSpan);
          }

          childTr.appendChild(tdChildDomain);
          childTr.appendChild(tdChildIp);
          childTr.appendChild(tdChildProto);
          fragment.appendChild(childTr);
        }
      }
    }
  }

  resizePopup(domains);

  if (renderedRowsCount === 0) {
    tbody.replaceChildren(createEmptyRow(translate('state.noMatches')));
    return;
  }

  tbody.innerHTML = '';
  tbody.appendChild(fragment);
}

function matchesQuery(domain, ip, ipData, query) {
  const tokens = [
    domain,
    ip,
    ipData.type,
    ipData.type === 'v4' ? 'ipv4' : 'ipv6',
    ipData.local ? translate('filter.localAliases') : ''
  ];

  return tokens.join(' ').toLowerCase().includes(query);
}

function resizePopup(domains) {
  if (domains.length === 0) {
    document.documentElement.style.setProperty('--domain-col-width', `${MIN_DOMAIN_WIDTH}px`);
    document.documentElement.style.setProperty('--popup-width', `${MIN_POPUP_WIDTH}px`);
    return;
  }

  const longestDomain = domains.reduce((longest, [domain]) => {
    return domain.length > longest.length ? domain : longest;
  }, '');

  const measuredDomainWidth = measureTextWidth(longestDomain, '600 13px system-ui') + 42;
  const domainWidth = clamp(measuredDomainWidth, MIN_DOMAIN_WIDTH, MAX_DOMAIN_WIDTH);
  const popupWidth = clamp(domainWidth + FIXED_COLUMN_WIDTH, MIN_POPUP_WIDTH, MAX_POPUP_WIDTH);

  document.documentElement.style.setProperty('--domain-col-width', `${domainWidth}px`);
  document.documentElement.style.setProperty('--popup-width', `${popupWidth}px`);
}

function measureTextWidth(text, font) {
  const canvas = measureTextWidth.canvas || document.createElement('canvas');
  measureTextWidth.canvas = canvas;
  const context = canvas.getContext('2d');
  context.font = font;
  return context.measureText(text).width;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}


function showIpLookup(ip, anchorRow) {
  const existingRow = document.querySelector('.lookup-row');
  if (existingRow && activeLookupIp === ip) {
    existingRow.remove();
    activeLookupIp = null;
    return;
  }

  if (existingRow) existingRow.remove();

  activeLookupIp = ip;
  const lookupRow = createLookupRow(translate('lookup.loading'));
  anchorRow.after(lookupRow);

  chrome.runtime.sendMessage({ action: 'lookupIp', ip }, (response) => {
    if (activeLookupIp !== ip) return;
    const cell = lookupRow.firstElementChild;
    cell.textContent = '';
    cell.appendChild(createLookupContent(response));
  });
}

function createLookupRow(text) {
  const tr = document.createElement('tr');
  tr.className = 'lookup-row';

  const td = document.createElement('td');
  td.colSpan = 3;
  td.textContent = text;
  tr.appendChild(td);

  return tr;
}

function createEmptyRow(message) {
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = 3;
  td.className = 'empty-state';
  td.textContent = message;
  tr.appendChild(td);
  return tr;
}

function createLookupContent(info) {
  if (!info || info.status === 'error') {
    return createLookupMessage(translate(info?.messageKey || 'lookup.failed'));
  }

  if (info.status === 'local') {
    return createLookupPanel([
      ['IP', info.ip],
      [translate('lookup.type'), translate('lookup.localAddress')],
      ['ASN', translate('lookup.localAsnSkipped')]
    ]);
  }

  return createLookupPanel([
    ['ASN', info.asn || translate('lookup.unknown')],
    [translate('lookup.service'), info.service || translate('lookup.unknown')],
    ['Prefix', info.prefix || translate('lookup.unknown')],
    [translate('lookup.source'), info.source || translate('lookup.unknown')]
  ]);
}

function createLookupMessage(message) {
  const span = document.createElement('span');
  span.textContent = message;
  return span;
}

function createLookupPanel(items) {
  const panel = document.createElement('div');
  panel.className = 'lookup-panel';

  for (const [label, value] of items) {
    const item = document.createElement('div');
    item.className = 'lookup-item';

    const labelElement = document.createElement('span');
    labelElement.className = 'lookup-label';
    labelElement.textContent = label;

    const valueElement = document.createElement('span');
    valueElement.className = 'lookup-value';
    valueElement.textContent = value;

    item.appendChild(labelElement);
    item.appendChild(valueElement);
    panel.appendChild(item);
  }

  return panel;
}

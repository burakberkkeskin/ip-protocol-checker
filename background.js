// Keep per-tab data in memory so closed tabs can be cleaned up quickly.
const tabStats = new Map();
const ipLookupCache = new Map();

const EMPTY_STATS = () => ({ v4: 0, v6: 0, local: 0, domains: {} });
const SOURCE_APP = "ipvchecker";

// RFC 1918 (IPv4) and RFC 4193 / RFC 4291 (IPv6) local network detection.
function isLocalIP(ip) {
  // IPv4 Private & Loopback & Link-local
  if (ip.match(/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/)) return true;
  if (ip.match(/^(127\.|169\.254\.)/)) return true;
  // IPv6 ULA, Link-local, Loopback
  if (ip.match(/^(fc|fd|fe80|fe90|fea0|feb0|::1)/i)) return true;
  return false;
}

function isTrackableRequest(details) {
  if (details.tabId === -1 || !details.ip) return false;

  try {
    const url = new URL(details.url);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (error) {
    return false;
  }
}

function normalizeAsn(asn) {
  if (!asn) return "";
  const value = String(asn);
  return value.startsWith("AS") ? value : `AS${value}`;
}

async function lookupIpInfo(ip) {
  if (!ip) {
    return { status: "error", messageKey: "lookup.ipMissing" };
  }

  if (isLocalIP(ip)) {
    return {
      status: "local",
      ip,
      service: "Local network",
      prefix: "LAN",
      source: "Local classifier"
    };
  }

  if (ipLookupCache.has(ip)) {
    return ipLookupCache.get(ip);
  }

  const result = await fetchRipeStatInfo(ip);
  ipLookupCache.set(ip, result);
  return result;
}

async function fetchRipeStatInfo(ip) {
  try {
    const networkUrl = `https://stat.ripe.net/data/network-info/data.json?resource=${encodeURIComponent(ip)}&sourceapp=${SOURCE_APP}`;
    const networkResponse = await fetch(networkUrl);
    if (!networkResponse.ok) throw new Error(`network-info ${networkResponse.status}`);

    const networkJson = await networkResponse.json();
    const prefix = networkJson?.data?.prefix || "";
    const asns = Array.isArray(networkJson?.data?.asns)
      ? networkJson.data.asns.map(normalizeAsn).filter(Boolean)
      : [normalizeAsn(networkJson?.data?.asns)].filter(Boolean);

    let holders = [];
    if (prefix) {
      const prefixUrl = `https://stat.ripe.net/data/prefix-overview/data.json?resource=${encodeURIComponent(prefix)}&sourceapp=${SOURCE_APP}`;
      const prefixResponse = await fetch(prefixUrl);
      if (prefixResponse.ok) {
        const prefixJson = await prefixResponse.json();
        holders = Array.isArray(prefixJson?.data?.asns)
          ? prefixJson.data.asns.map((entry) => entry?.holder).filter(Boolean)
          : [];
      }
    }

    return {
      status: asns.length || prefix ? "found" : "unknown",
      ip,
      asn: asns.join(", "),
      service: [...new Set(holders)].join(", "),
      prefix,
      source: "RIPEstat"
    };
  } catch (error) {
    return {
      status: "error",
      ip,
      messageKey: "lookup.failed",
      source: "RIPEstat"
    };
  }
}

// Update the toolbar badge for the active protocol balance.
function updateBadge(tabId, stats) {
  const total = stats.v4 + stats.v6;
  if (total === 0) {
    chrome.action.setBadgeText({ text: "", tabId });
    return;
  }

  const v6Percent = Math.round((stats.v6 / total) * 100);
  const text = `${v6Percent}%`;
  const color = v6Percent >= 50 ? "#4caf50" : "#f44336";
  
  chrome.action.setBadgeText({ text, tabId });
  chrome.action.setBadgeBackgroundColor({ color, tabId });
}

// Main listener. It runs non-blocking and only observes HTTP(S) requests.
chrome.webRequest.onResponseStarted.addListener(
  (details) => {
    if (!isTrackableRequest(details)) return;

    const ip = details.ip;
    const url = new URL(details.url);
    const domain = url.hostname;

    let stats = tabStats.get(details.tabId);
    if (!stats) {
      stats = EMPTY_STATS();
    }

    const type = ip.includes(':') ? 'v6' : 'v4';
    const local = isLocalIP(ip);

    stats[type]++;
    if (local) stats.local++;

    if (!stats.domains[domain]) {
      stats.domains[domain] = {
        count: 1,
        ips: {
          [ip]: { type, local, count: 1 }
        }
      };
    } else {
      stats.domains[domain].count++;
      
      if (!stats.domains[domain].ips[ip]) {
        stats.domains[domain].ips[ip] = { type, local, count: 1 };
      } else {
        stats.domains[domain].ips[ip].count++;
      }
    }

    tabStats.set(details.tabId, stats);
    updateBadge(details.tabId, stats);
  },
  { urls: ["http://*/*", "https://*/*"] }
);

// Garbage collection: remove tab data after the tab is closed.
chrome.tabs.onRemoved.addListener((tabId) => {
  tabStats.delete(tabId);
});

chrome.webNavigation.onCommitted.addListener((details) => {
  // Reset only when the main frame navigates.
  if (details.frameId === 0) {
    tabStats.set(details.tabId, EMPTY_STATS());
    chrome.action.setBadgeText({ text: "", tabId: details.tabId });
  }
});

// Respond to popup requests.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getStats") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        const stats = tabStats.get(tabs[0].id) || EMPTY_STATS();
        sendResponse(stats);
      } else {
        sendResponse(null);
      }
    });
    return true;
  }

  if (request.action === "lookupIp") {
    lookupIpInfo(request.ip).then(sendResponse);
    return true;
  }
});

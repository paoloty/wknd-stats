'use strict';

const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '../data/roster-cache.json');

let memoryCache = null;

async function fetchRoster() {
  const portalUrl = process.env.PORTAL_URL || 'http://localhost:4000';
  const apiKey = process.env.PORTAL_ROSTER_API_KEY || '';

  try {
    const res = await fetch(`${portalUrl}/api/roster`, {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data?.teams) || !Array.isArray(data?.players)) {
      throw new Error('Unexpected roster shape from portal');
    }
    memoryCache = data;
    try { fs.writeFileSync(CACHE_FILE, JSON.stringify(data)); } catch (_) {}
    return data;
  } catch (error) {
    console.warn('[roster] Failed to fetch from portal:', error.message);

    if (memoryCache) {
      console.warn('[roster] Using in-memory cached roster as fallback');
      return memoryCache;
    }

    try {
      const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      console.warn('[roster] Using file-cached roster as fallback');
      memoryCache = cached;
      return cached;
    } catch (_) {}

    return null;
  }
}

module.exports = { fetchRoster };

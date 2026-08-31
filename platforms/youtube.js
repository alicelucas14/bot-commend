// ============================================================
// platforms/youtube.js — YouTube metadata (used by platform registry)
// ============================================================
// NOTE: The actual multi-account YouTube posting logic lives in server.js
// This module exposes the platform metadata for the registry UI.
const META = {
  id:     'youtube',
  name:   'YouTube',
  icon:   '🎥',
  color:  '#ff0000',
  accent: '#ff0000',
  supportsTrending: true,
  credentialFields: [], // YouTube uses OAuth tokens stored in tokens/ folder
};

function isConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

async function testConnection() {
  if (!isConfigured()) return { ok: false, message: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set' };
  return { ok: true, message: 'Configured — uses OAuth2 accounts from tokens/' };
}

module.exports = { ...META, isConfigured, testConnection };

// ============================================================
// platforms/facebook.js — Facebook via Graph API
// ============================================================
require('dotenv').config();
const axios = require('axios');

const ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const PAGE_ID      = process.env.FACEBOOK_PAGE_ID;
const GRAPH_URL    = 'https://graph.facebook.com/v19.0';

const META = {
  id:     'facebook',
  name:   'Facebook',
  icon:   '📘',
  color:  '#1877f2',
  accent: '#1877f2',
  supportsTrending: false,
  credentialFields: [
    { key: 'FACEBOOK_PAGE_ACCESS_TOKEN', label: 'Page Access Token', type: 'password', placeholder: 'From developers.facebook.com' },
    { key: 'FACEBOOK_PAGE_ID',           label: 'Page ID',           type: 'text',     placeholder: '1234567890' },
  ],
};

function isConfigured() {
  return !!(ACCESS_TOKEN && PAGE_ID);
}

function extractPostId(url) {
  // https://www.facebook.com/pagename/posts/1234567890
  const match1 = url.match(/\/posts\/(\d+)/);
  if (match1) return match1[1];
  // https://www.facebook.com/permalink.php?story_fbid=123&id=456
  const match2 = url.match(/story_fbid=(\d+)/);
  if (match2) return match2[1];
  // Bare numeric ID passed directly
  if (/^\d+$/.test(url.trim())) return url.trim();
  return null;
}

async function postComment(postUrl, comment) {
  if (!isConfigured()) throw new Error('Facebook credentials not configured (FACEBOOK_PAGE_ACCESS_TOKEN / FACEBOOK_PAGE_ID)');

  const postId = extractPostId(postUrl);
  if (!postId) throw new Error('Invalid Facebook post URL — need a /posts/ID or story_fbid= URL');

  const res = await axios.post(
    `${GRAPH_URL}/${postId}/comments`,
    { message: comment },
    { params: { access_token: ACCESS_TOKEN } }
  );
  return { success: true, commentId: res.data.id, platform: 'facebook' };
}

async function testConnection() {
  if (!isConfigured()) {
    return {
      ok:      false,
      message: 'FACEBOOK_PAGE_ACCESS_TOKEN / FACEBOOK_PAGE_ID not set in .env',
    };
  }
  try {
    const res = await axios.get(`${GRAPH_URL}/${PAGE_ID}`, {
      params: { fields: 'name,fan_count', access_token: ACCESS_TOKEN },
    });
    return {
      ok:      true,
      message: `Connected to page: ${res.data.name} (${Number(res.data.fan_count || 0).toLocaleString()} followers)`,
    };
  } catch (err) {
    const fbErr = err.response?.data?.error?.message || err.message;
    return { ok: false, message: `Graph API error: ${fbErr}` };
  }
}

module.exports = { ...META, isConfigured, testConnection, postComment };

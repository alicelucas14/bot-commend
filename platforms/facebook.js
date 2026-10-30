// ============================================================
// platforms/facebook.js — Facebook via Graph API
// ============================================================
require('dotenv').config();
const axios = require('axios');

const getFacebookCredentials = () => ({
  accessToken: process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '',
  pageId:      process.env.FACEBOOK_PAGE_ID || '',
});
const GRAPH_URL    = 'https://graph.facebook.com/v19.0';

const META = {
  id:     'facebook',
  name:   'Facebook',
  icon:   '📘',
  color:  '#1877f2',
  accent: '#1877f2',
  supportsTrending: true,
  credentialFields: [
    { key: 'FACEBOOK_PAGE_ACCESS_TOKEN', label: 'Page Access Token', type: 'password', placeholder: 'From developers.facebook.com' },
    { key: 'FACEBOOK_PAGE_ID',           label: 'Page ID',           type: 'text',     placeholder: '1234567890' },
  ],
};

function isConfigured() {
  const { accessToken, pageId } = getFacebookCredentials();
  return !!(accessToken && pageId);
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

  const { accessToken } = getFacebookCredentials();
  const res = await axios.post(
    `${GRAPH_URL}/${postId}/comments`,
    { message: comment },
    { params: { access_token: accessToken } }
  );
  return { success: true, commentId: res.data.id, platform: 'facebook' };
}

async function testConnection() {
  const { accessToken, pageId } = getFacebookCredentials();
  if (!isConfigured()) {
    return {
      ok:      false,
      message: 'FACEBOOK_PAGE_ACCESS_TOKEN / FACEBOOK_PAGE_ID not set in .env',
    };
  }
  try {
    const res = await axios.get(`${GRAPH_URL}/${pageId}`, {
      params: { fields: 'name,fan_count', access_token: accessToken },
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


const COUNTRY_TOPICS = {
  IN: ['Bollywood', 'Cricket', 'Desi Memes', 'Indian Viral Video', 'Daily News India'],
  ID: ['Viral Indonesia', 'Berita Viral', 'Video Lucu', 'Trending Indonesia'],
  US: ['Viral News', 'Top Videos', 'Trending Reels', 'Daily Humor'],
  GB: ['UK News', 'Trending UK', 'Viral Reels'],
  DEFAULT: ['Trending Viral', 'Top Video', 'World News'],
};

async function getTrending(regionCode = 'US', maxResults = 20) {
  const { accessToken, pageId } = getFacebookCredentials();
  const code = (regionCode || 'US').toUpperCase();

  if (isConfigured()) {
    try {
      const res = await axios.get(`${GRAPH_URL}/${pageId}/feed`, {
        params: {
          fields: 'id,message,permalink_url,full_picture,created_time,shares',
          limit: maxResults,
          access_token: accessToken,
        },
        timeout: 10000,
      });

      const posts = res.data.data || [];
      if (posts.length > 0) {
        return posts.map(p => ({
          id: p.id,
          title: p.message ? p.message.substring(0, 100) : `Facebook Post ${p.id}`,
          url: p.permalink_url || `https://www.facebook.com/${p.id}`,
          thumbnail: p.full_picture || 'https://static.xx.fbcdn.net/rsrc.php/v3/y2/r/13w1lD_j0sM.png',
          channel: `Page: ${pageId}`,
          views: `${p.shares?.count || 0} shares`,
        }));
      }
    } catch (e) {
      console.warn('Facebook Page feed query failed, using regional discovery feed:', e.message);
    }
  }

  const topics = COUNTRY_TOPICS[code] || COUNTRY_TOPICS.DEFAULT;
  return topics.slice(0, maxResults).map((topic, i) => ({
    id: `fb_${code}_${i}`,
    title: `${topic} — Popular on Facebook`,
    url: `https://www.facebook.com/watch/search/?q=${encodeURIComponent(topic)}`,
    thumbnail: 'https://static.xx.fbcdn.net/rsrc.php/v3/y2/r/13w1lD_j0sM.png',
    channel: `Facebook Watch • ${code}`,
    views: '🔥 Popular Content',
  }));
}

module.exports = { ...META, isConfigured, testConnection, postComment, getTrending };

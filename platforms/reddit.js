// ============================================================
// platforms/reddit.js — Reddit via snoowrap (official API)
// ============================================================
require('dotenv').config();

// Country → popular subreddits mapping
const COUNTRY_SUBREDDITS = {
  US: ['popular', 'news', 'worldnews', 'AskAmerica'],
  GB: ['unitedkingdom', 'CasualUK', 'AskUK'],
  AU: ['australia', 'AustralianPolitics'],
  CA: ['canada', 'onguardforthee'],
  ID: ['indonesia', 'Bali'],
  BR: ['brasil', 'desabafos'],
  MX: ['mexico', 'mexico_politics'],
  IN: ['india', 'IndiaSpeaks', 'IndiaUnited'],
  PH: ['Philippines', 'phclassifieds'],
  MY: ['malaysia', 'MalaysiaFi'],
  SG: ['singapore', 'singaporefi'],
  TH: ['Thailand', 'bangkokbad'],
  VN: ['vietnam', 'VietNam'],
  PK: ['pakistan', 'karachi'],
  BD: ['bangladesh'],
  JP: ['japan', 'japanlife'],
  KR: ['korea', 'hanguk'],
  DE: ['de', 'germany', 'ich_iel'],
  FR: ['france', 'francais'],
  IT: ['italy', 'italyincontresti'],
  ES: ['spain', 'es'],
  NL: ['Netherlands', 'DutchFIRE'],
  TR: ['Turkey', 'Turkiye'],
  RU: ['russia', 'russian'],
  SA: ['saudiarabia'],
  AE: ['dubai', 'UAE'],
  EG: ['egypt'],
  NG: ['Nigeria', 'lagos'],
  ZA: ['southafrica', 'capetown'],
  KE: ['Kenya', 'Nairobi'],
  AR: ['argentina', 'argentina_adult'],
  CO: ['colombia'],
  CL: ['chile'],
  PE: ['peru'],
  DEFAULT: ['popular', 'worldnews'],
};

const META = {
  id:     'reddit',
  name:   'Reddit',
  icon:   '🟠',
  color:  '#ff4500',
  accent: '#ff4500',
  supportsTrending: true,
  credentialFields: [
    { key: 'REDDIT_CLIENT_ID',     label: 'Client ID',     type: 'text',     placeholder: 'From reddit.com/prefs/apps' },
    { key: 'REDDIT_CLIENT_SECRET', label: 'Client Secret', type: 'password', placeholder: '••••••••••••••••' },
    { key: 'REDDIT_USERNAME',      label: 'Username',      type: 'text',     placeholder: 'your_reddit_username' },
    { key: 'REDDIT_PASSWORD',      label: 'Password',      type: 'password', placeholder: '••••••••' },
  ],
};

function isConfigured() {
  return !!(
    process.env.REDDIT_CLIENT_ID &&
    process.env.REDDIT_CLIENT_SECRET &&
    process.env.REDDIT_USERNAME &&
    process.env.REDDIT_PASSWORD
  );
}

function getClient() {
  const Snoowrap = require('snoowrap');
  return new Snoowrap({
    userAgent:    process.env.REDDIT_USER_AGENT || 'botAdmin/1.0 by u/botadmin',
    clientId:     process.env.REDDIT_CLIENT_ID,
    clientSecret: process.env.REDDIT_CLIENT_SECRET,
    username:     process.env.REDDIT_USERNAME,
    password:     process.env.REDDIT_PASSWORD,
  });
}

function extractSubmissionId(url) {
  // https://www.reddit.com/r/subreddit/comments/SUBMISSIONID/title/
  const match = url.match(/\/comments\/([a-z0-9]+)/i);
  return match ? match[1] : null;
}

async function postComment(threadUrl, comment) {
  if (!isConfigured()) throw new Error('Reddit credentials not configured. See .env for required keys.');

  const submissionId = extractSubmissionId(threadUrl);
  if (!submissionId) throw new Error('Invalid Reddit URL — must be a thread link (contains /comments/)');

  const r          = getClient();
  const submission = r.getSubmission(submissionId);
  const reply      = await submission.reply(comment);
  return { success: true, commentId: reply.id, platform: 'reddit' };
}

async function getTrending(regionCode = 'US', maxResults = 20) {
  if (!isConfigured()) throw new Error('Reddit credentials not configured');

  const r        = getClient();
  const subs     = COUNTRY_SUBREDDITS[regionCode] || COUNTRY_SUBREDDITS.DEFAULT;
  const perSub   = Math.ceil(maxResults / subs.length);
  const allPosts = [];

  for (const sub of subs.slice(0, 3)) {
    try {
      const hot = await r.getSubreddit(sub).getHot({ limit: perSub });
      hot.forEach(post => {
        allPosts.push({
          id:        post.id,
          title:     post.title,
          url:       `https://www.reddit.com${post.permalink}`,
          thumbnail: post.thumbnail && post.thumbnail.startsWith('http') ? post.thumbnail : '',
          channel:   `r/${post.subreddit_name_prefixed.replace('r/', '')}`,
          views:     `${Number(post.score).toLocaleString()} upvotes · ${post.num_comments} comments`,
        });
      });
    } catch (err) {
      console.warn(`Reddit: failed to fetch r/${sub} —`, err.message);
    }
  }

  return allPosts.slice(0, maxResults);
}

async function testConnection() {
  if (!isConfigured()) {
    return {
      ok:      false,
      message: 'REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET / REDDIT_USERNAME / REDDIT_PASSWORD not set',
    };
  }
  try {
    const r  = getClient();
    const me = await r.getMe();
    return { ok: true, message: `Connected as u/${me.name}` };
  } catch (err) {
    return { ok: false, message: `API error: ${err.message}` };
  }
}

module.exports = { ...META, isConfigured, testConnection, postComment, getTrending };

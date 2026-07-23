'use strict';

/**
 * Zaobao (每日早报) Generator
 *
 * Fetches daily news from alapi.cn API during `hexo generate`,
 * generates /news/index.html — zero external dependencies.
 *
 * Token sources (priority):
 *   1. process.env.ZAOBAO_TOKEN — environment variable (best for CI/CD)
 *   2. zaobao.token in site root _config.yml
 *
 * If neither is set, the build proceeds with an empty page (no crash).
 *
 * Usage:
 *   # Via env var (recommended for CI/CD):
 *   ZAOBAO_TOKEN=your_token hexo generate
 *
 *   # Via _config.yml (local dev):
 *   zaobao:
 *     token: your_token
 */

var https = require('https');
var querystring = require('querystring');

var TOKEN = process.env.ZAOBAO_TOKEN || (hexo.config.zaobao && hexo.config.zaobao.token) || '';
var API_URL = 'https://v3.alapi.cn/api/zaobao';
var PAGE_PATH = 'news/index.html';

hexo.extend.generator.register('zaobao', function () {
  var params = querystring.stringify({
    token: TOKEN,
    format: 'json'
  });
  var url = API_URL + '?' + params;

  hexo.log.info('[zaobao] Fetching daily news from alapi.cn...');

  return fetchJson(url).then(function (result) {
    if (!result || result.code !== 200) {
      hexo.log.warn('[zaobao] API returned error: ' + (result && result.msg || 'unknown'));
      return emptyPage();
    }

    var data = result.data || {};
    var rawNews = data.news || [];
    var news = normalizeNews(rawNews);
    var date = data.date || '';
    var motto = (data.weiyu || data.motto || '').replace(/^【微语】/, '').trim();
    var updateTime = nowStr();

    hexo.log.info('[zaobao] Success: ' + news.length + ' articles on ' + (date || 'today'));

    return {
      path: PAGE_PATH,
      layout: 'daily',
      data: {
        title: '每日资讯',
        newsDate: date,
        news: news,
        motto: motto,
        updateTime: updateTime
      }
    };
  }).catch(function (err) {
    hexo.log.error('[zaobao] Request failed: ' + err.message);
    return emptyPage();
  });
});

/**
 * Normalize news array — supports both string[] and {title, url}[] formats.
 */
function normalizeNews(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(function (item) {
    if (typeof item === 'string') {
      return { title: stripLeadingNumber(item), url: '' };
    }
    if (item && typeof item === 'object') {
      return {
        title: stripLeadingNumber(item.title || ''),
        url: item.url || item.link || ''
      };
    }
    return { title: stripLeadingNumber(String(item)), url: '' };
  }).filter(function (item) {
    return item.title.length > 0;
  });
}

/**
 * Strip leading number prefix like "1、", "2.", "3．" from news text.
 */
function stripLeadingNumber(text) {
  return String(text).replace(/^\d+[、.．\s]\s*/, '');
}

function fetchJson(url) {
  return new Promise(function (resolve, reject) {
    https.get(url, function (res) {
      var body = '';
      res.setEncoding('utf8');
      res.on('data', function (chunk) { body += chunk; });
      res.on('end', function () {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('Invalid JSON response')); }
      });
    }).on('error', reject);
  });
}

function emptyPage() {
  return {
    path: PAGE_PATH,
    layout: 'daily',
    data: {
      title: '每日资讯',
      newsDate: '',
      news: [],
      motto: '',
      updateTime: ''
    }
  };
}

function nowStr() {
  var d = new Date();
  var pad = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

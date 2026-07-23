'use strict';

/**
 * Daily News Generator (聚合)
 *
 * Fetches three data sources from alapi.cn during `hexo generate`:
 *   - 每日早报  /api/zaobao
 *   - 微博热搜  /api/new/wbtop
 *   - 知乎日报  /api/zhihu
 *
 * Token sources (priority):
 *   1. process.env.ZAOBAO_TOKEN — environment variable
 *   2. zaobao.token in site root _config.yml
 *
 * If token is missing, build proceeds with empty state.
 */

var https = require('https');
var querystring = require('querystring');

var TOKEN = process.env.ZAOBAO_TOKEN || (hexo.config.zaobao && hexo.config.zaobao.token) || '';
var PAGE_PATH = 'news/index.html';

hexo.extend.generator.register('zaobao', function () {

  if (!TOKEN) {
    hexo.log.warn('[daily] Token not configured. Skipping all fetches.');
    return emptyPage();
  }

  var now = new Date();
  var updateTime = nowStr(now);
  var dateStr = fmtDate(now);

  hexo.log.info('[daily] Fetching 3 sources...');

  return Promise.all([
    fetchZaobao(),
    fetchWeibo(),
    fetchZhihu()
  ]).then(function (results) {
    var zaobao = results[0] || { news: [], motto: '' };
    var weibo  = results[1] || { news: [] };
    var zhihu  = results[2] || { news: [] };

    // Use the earliest date from any source that returned data
    var newsDate = zaobao.date || dateStr;

    hexo.log.info('[daily] Done — zaobao:' + zaobao.news.length +
      ' weibo:' + weibo.news.length + ' zhihu:' + zhihu.news.length);

    return {
      path: PAGE_PATH,
      layout: 'daily',
      data: {
        title: '每日资讯',
        newsDate: newsDate,
        updateTime: updateTime,
        zaobao: zaobao,
        weibo: weibo,
        zhihu: zhihu
      }
    };
  }).catch(function (err) {
    hexo.log.error('[daily] Fatal: ' + err.message);
    return emptyPage();
  });
});

/* ===== Data Fetchers ===== */

function fetchZaobao() {
  var url = 'https://v3.alapi.cn/api/zaobao?' + querystring.stringify({
    token: TOKEN, format: 'json'
  });
  hexo.log.info('[daily] Fetching zaobao...');
  return fetchJson(url).then(function (res) {
    if (!res || res.code !== 200) {
      hexo.log.warn('[daily] zaobao API error: ' + (res && res.msg || 'unknown'));
      return { news: [], motto: '', date: '' };
    }
    var d = res.data || {};
    var raw = d.news || [];
    var news = normalizeStrArr(raw).map(function (t) {
      return { title: stripLeadingNum(t), url: '' };
    });
    var motto = (d.weiyu || d.motto || '').replace(/^【微语】/, '').trim();
    hexo.log.info('[daily] zaobao: ' + news.length + ' items');
    return { news: news, motto: motto, date: d.date || '' };
  }).catch(function (err) {
    hexo.log.warn('[daily] zaobao failed: ' + err.message);
    return { news: [], motto: '', date: '' };
  });
}

function fetchWeibo() {
  var url = 'https://v3.alapi.cn/api/new/wbtop?' + querystring.stringify({
    token: TOKEN, num: 15
  });
  hexo.log.info('[daily] Fetching weibo hot search...');
  return fetchJson(url).then(function (res) {
    if (!res || res.code !== 200) {
      hexo.log.warn('[daily] weibo API error: ' + (res && res.msg || 'unknown'));
      return { news: [] };
    }
    var items = Array.isArray(res.data) ? res.data : [];
    var news = items.map(function (item) {
      var rawUrl = item.url || '';
      // Filter invalid URLs (e.g. "https://s.weibo.comjavascript:void(0)")
      if (!/^https?:\/\//i.test(rawUrl) || /javascript:/i.test(rawUrl)) rawUrl = '';
      return {
        title: item.hot_word || '',
        hot: item.hot_num,
        url: rawUrl
      };
    }).filter(function (item) { return item.title; });
    hexo.log.info('[daily] weibo: ' + news.length + ' items');
    return { news: news };
  }).catch(function (err) {
    hexo.log.warn('[daily] weibo failed: ' + err.message);
    return { news: [] };
  });
}

function fetchZhihu() {
  var url = 'https://v3.alapi.cn/api/zhihu?' + querystring.stringify({
    token: TOKEN
  });
  hexo.log.info('[daily] Fetching zhihu daily...');
  return fetchJson(url).then(function (res) {
    if (!res || res.code !== 200) {
      hexo.log.warn('[daily] zhihu API error: ' + (res && res.msg || 'unknown'));
      return { news: [] };
    }
    var d = res.data || {};
    var stories = d.stories || [];
    var news = stories.map(function (item) {
      return {
        title: item.title || '',
        url: item.url || '',
        hint: item.hint || '',
        image: item.image || (item.images && item.images[0]) || ''
      };
    }).filter(function (item) { return item.title; });
    hexo.log.info('[daily] zhihu: ' + news.length + ' items');
    return { news: news };
  }).catch(function (err) {
    hexo.log.warn('[daily] zhihu failed: ' + err.message);
    return { news: [] };
  });
}

/* ===== Helpers ===== */

function fetchJson(url) {
  return new Promise(function (resolve, reject) {
    https.get(url, function (res) {
      var body = '';
      res.setEncoding('utf8');
      res.on('data', function (chunk) { body += chunk; });
      res.on('end', function () {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('Invalid JSON')); }
      });
    }).on('error', reject);
  });
}

function normalizeStrArr(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(function (i) { return String(i); }).filter(function (i) { return i.length > 0; });
}

function stripLeadingNum(text) {
  return String(text).replace(/^\d+[、.．\s]\s*/, '');
}

function fmtDate(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function nowStr(d) {
  var pad = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function emptyPage() {
  return {
    path: PAGE_PATH,
    layout: 'daily',
    data: {
      title: '每日资讯',
      newsDate: '',
      updateTime: '',
      zaobao: { news: [], motto: '' },
      weibo: { news: [] },
      zhihu: { news: [] }
    }
  };
}

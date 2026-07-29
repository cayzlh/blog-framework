'use strict';

/**
 * Daily News Generator (60s-API)
 *
 * Fetches data from self-hosted 60s-API during `hexo generate`:
 *   - 每日早报  /v2/60s
 *   - 历史上的今天  /v2/today-in-history
 *   - 知乎热榜  /v2/zhihu
 *   - 微博热搜  /v2/weibo
 *   - AI 资讯  /v2/ai-news
 *   - 摸鱼进度  /v2/moyu
 *   - 今日运势  /v2/luck
 *
 * Configuration (themes/polaris/_config.yml):
 *   daily:
 *     enable: true
 *     api_base: 'https://glance.cayzlh.com'
 *     zaobao: { enable: true }
 *     zhihu:  { enable: true }
 *     weibo:  { enable: true }
 *
 * Cache: 结果写入 .daily_cache.json，同一天重复构建不再请求 API。
 */

var https = require('https');
var http  = require('http');
var fs    = require('fs');
var path  = require('path');

var PAGE_PATH  = 'news/index.html';
var CACHE_FILE = '.daily_cache.json';

hexo.extend.generator.register('zaobao', function () {

  /* ---- read config ---- */
  var themeCfg = (hexo.theme.config && hexo.theme.config.daily) || {};
  var siteCfg  = hexo.config.daily || {};
  var cfg = {};
  for (var k in themeCfg) cfg[k] = themeCfg[k];
  for (var k in siteCfg)  cfg[k] = siteCfg[k];

  var enabled = cfg.enable !== false;
  var apiBase = cfg.api_base || 'https://glance.cayzlh.com';

  /* ---- cache first ---- */
  var cache = loadCache();
  if (cache) {
    hexo.log.info('[daily] Using cache from ' + cache.date + ', skip API requests.');
    return formatPage(cache.data, cache.date, cache.time);
  }

  if (!enabled) {
    hexo.log.info('[daily] Disabled by config');
    return emptyPage();
  }

  /* ---- branch switches ---- */
  var fetchZaobao = !(cfg.zaobao && cfg.zaobao.enable === false);
  var fetchZhihu  = !(cfg.zhihu  && cfg.zhihu.enable  === false);
  var fetchWeibo  = !(cfg.weibo  && cfg.weibo.enable  === false);
  // 新增模块默认启用
  var fetchHistory = cfg.history === undefined || cfg.history.enable !== false;
  var fetchAiNews  = cfg.ai_news === undefined || cfg.ai_news.enable !== false;
  var fetchMoyu    = cfg.moyu === undefined || cfg.moyu.enable !== false;
  var fetchLuck    = cfg.luck === undefined || cfg.luck.enable !== false;
  var fetchHackerNews = cfg.hacker_news === undefined || cfg.hacker_news.enable !== false;

  hexo.log.info('[daily] Fetching from ' + apiBase + '...');

  var tasks = {};

  if (fetchZaobao)  tasks.zaobao = fetchJson(apiBase + '/v2/60s');
  if (fetchHistory) tasks.history = fetchJson(apiBase + '/v2/today-in-history');
  if (fetchZhihu)   tasks.zhihu = fetchJson(apiBase + '/v2/zhihu');
  if (fetchWeibo)   tasks.weibo = fetchJson(apiBase + '/v2/weibo');
  if (fetchAiNews)  tasks.aiNews = fetchJson(apiBase + '/v2/ai-news');
  if (fetchMoyu)    tasks.moyu = fetchJson(apiBase + '/v2/moyu');
  if (fetchLuck)    tasks.luck = fetchJson(apiBase + '/v2/luck');
  if (fetchHackerNews) tasks.hackerNews = fetchJson(apiBase + '/v2/hacker-news/top');

  var entries = Object.keys(tasks).map(function (k) { return tasks[k]; });
  var keys = Object.keys(tasks);

  return Promise.all(entries).then(function (results) {
    var raw = {};
    for (var i = 0; i < keys.length; i++) raw[keys[i]] = results[i];

    var data = buildData(raw);
    var now = new Date();
    var dateStr = fmtDate(now);
    var timeStr = nowStr(now);

    /* write cache */
    saveCache({ date: dateStr, time: timeStr, data: data });

    return formatPage(data, dateStr, timeStr);
  }).catch(function (err) {
    hexo.log.error('[daily] Fatal: ' + err.message);
    return emptyPage();
  });
});

/* ===== Data builder ===== */

function buildData(raw) {
  var data = {};
  var now = new Date();

  /* ---- 日签（从 60s + moyu + luck 提取） ---- */
  var s = raw.zaobao && raw.zaobao.code === 200 ? raw.zaobao.data : null;
  var m = raw.moyu   && raw.moyu.code   === 200 ? raw.moyu.data   : null;
  var l = raw.luck   && raw.luck.code   === 200 ? raw.luck.data   : null;

  data.daily = {
    date:        s ? s.date : fmtDate(now),
    dateDisplay: s ? formatDateDisplay(s.date) : '',
    dayOfWeek:   s ? (s.day_of_week || '') : '',
    lunarDate:   s ? (s.lunar_date || '') : '',
    tip:         s ? (s.tip || '') : '',
    nextWeekend: m && m.nextWeekend ? m.nextWeekend.daysUntil : null,
    luckRank:    l ? l.luck_rank : null,
    luckDesc:    l ? l.luck_desc : '',
  };

  /* ---- 每日早报 ---- */
  if (s && Array.isArray(s.news)) {
    data.zaobao = {
      news: s.news.map(function (t) { return { title: String(t).replace(/^\d+[、.．\s]\s*/, '') }; }),
      date: s.date || '',
    };
  } else {
    data.zaobao = { news: [], date: '' };
  }

  /* ---- 历史上的今天 ---- */
  if (raw.history && raw.history.code === 200) {
    var hi = raw.history.data;
    data.todayInHistory = {
      items: (hi && hi.items || []).map(function (item) {
        return {
          year: String(item.year || ''),
          title: item.title || '',
          description: item.description || '',
          event_type: item.event_type || '',
          link: item.link || '',
        };
      }),
    };
  } else {
    data.todayInHistory = { items: [] };
  }

  /* ---- 知乎热榜 ---- */
  if (raw.zhihu && raw.zhihu.code === 200) {
    var zData = raw.zhihu.data;
    data.zhihu = {
      news: (Array.isArray(zData) ? zData : []).map(function (item) {
        var hint = item.hot_value_desc || '';
        if (item.answer_cnt) hint = (hint ? hint + ' · ' : '') + item.answer_cnt + '回答';
        return {
          title: item.title || '',
          url: item.link || '',
          hint: hint,
          image: item.cover || (item.images && item.images[0]) || '',
        };
      }),
    };
  } else {
    data.zhihu = { news: [] };
  }

  /* ---- 微博热搜 ---- */
  if (raw.weibo && raw.weibo.code === 200) {
    var wData = raw.weibo.data;
    data.weibo = {
      news: (Array.isArray(wData) ? wData : []).map(function (item) {
        return {
          title: item.title || '',
          hot: item.hot_value || item.hot_num || 0,
          url: item.link || '',
        };
      }),
    };
  } else {
    data.weibo = { news: [] };
  }

  /* ---- AI 资讯 ---- */
  if (raw.aiNews && raw.aiNews.code === 200) {
    var aData = raw.aiNews.data;
    data.aiNews = {
      news: (aData && aData.news || []).map(function (item) {
        return {
          title: item.title || '',
          detail: item.detail || '',
          link: item.link || '',
          source: item.source || '',
        };
      }),
    };
  } else {
    data.aiNews = { news: [] };
  }

  /* ---- Hacker News ---- */
  if (raw.hackerNews && raw.hackerNews.code === 200) {
    data.hackerNews = {
      news: (Array.isArray(raw.hackerNews.data) ? raw.hackerNews.data : []).map(function (item) {
        return {
          title: item.title || '',
          link: item.link || '',
          score: item.score || 0,
          author: item.author || '',
        };
      }),
    };
  } else {
    data.hackerNews = { news: [] };
  }

  return data;
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  var p = dateStr.split('-');
  if (p.length !== 3) return dateStr;
  return parseInt(p[1], 10) + '月' + parseInt(p[2], 10) + '日';
}

/* ===== Page builder ===== */

function formatPage(data, newsDate, updateTime) {
  return {
    path: PAGE_PATH,
    layout: 'daily',
    data: {
      title: '每日资讯',
      newsDate: newsDate,
      updateTime: updateTime,
      daily: data.daily || {},
      zaobao: data.zaobao || { news: [] },
      todayInHistory: data.todayInHistory || { items: [] },
      zhihu: data.zhihu || { news: [] },
      weibo: data.weibo || { news: [] },
      aiNews: data.aiNews || { news: [] },
      hackerNews: data.hackerNews || { news: [] },
    },
  };
}

/* ===== HTTP fetch ===== */

function fetchJson(url) {
  return new Promise(function (resolve, reject) {
    var mod = url.indexOf('https://') === 0 ? https : http;
    mod.get(url, { timeout: 10000 }, function (res) {
      var body = '';
      res.setEncoding('utf8');
      res.on('data', function (c) { body += c; });
      res.on('end', function () {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('Invalid JSON from ' + url)); }
      });
    }).on('error', reject).on('timeout', function () {
      reject(new Error('Timeout: ' + url));
    });
  });
}

/* ===== Cache ===== */

function cachePath() {
  return path.join(hexo.base_dir, CACHE_FILE);
}

function loadCache() {
  try {
    var file = cachePath();
    if (!fs.existsSync(file)) return null;
    var raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    var today = fmtDate(new Date());
    if (raw.date === today) return raw;
    return null;
  } catch (e) {
    return null;
  }
}

function saveCache(obj) {
  try {
    fs.writeFileSync(cachePath(), JSON.stringify(obj, null, 2), 'utf-8');
  } catch (e) {
    // non-critical
  }
}

/* ===== Helpers ===== */

function fmtDate(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function nowStr(d) {
  d = d || new Date();
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
      daily: {},
      zaobao: { news: [] },
      todayInHistory: { items: [] },
      zhihu: { news: [] },
      weibo: { news: [] },
      aiNews: { news: [] },
      hackerNews: { news: [] },
    },
  };
}

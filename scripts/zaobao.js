'use strict';

/**
 * Daily News Generator (聚合)
 *
 * Fetches three data sources from alapi.cn during `hexo generate`:
 *   - 每日早报  /api/zaobao
 *   - 微博热搜  /api/new/wbtop
 *   - 知乎日报  /api/zhihu
 *
 * Configuration (themes/polaris/_config.yml):
 *   alapi:
 *     enable: true          # 总开关
 *     token: ''             # API Token
 *     zaobao: { enable }    # 分支开关
 *     zhihu:  { enable }
 *     weibo:  { enable }
 *
 * Token is read from alapi.token in themes/polaris/_config.yml
 *
 * Cache: 结果写入 .daily_cache.json，同一天重复构建不再请求 API，
 *        避免本地 hexo server 频繁消耗免费额度。
 */

var https = require('https');
var fs = require('fs');
var path = require('path');
var querystring = require('querystring');

var PAGE_PATH = 'news/index.html';
var CACHE_FILE = '.daily_cache.json';

hexo.extend.generator.register('zaobao', function () {

  /* ---- read config (theme + site merged, site takes priority) ---- */
  var themeCfg = hexo.theme.alapi || {};
  var siteCfg  = hexo.config.alapi || {};
  var cfg = {};
  for (var k in themeCfg) cfg[k] = themeCfg[k];
  for (var k in siteCfg)  cfg[k] = siteCfg[k];

  var total = cfg.enable !== false;
  var token = themeCfg.token || siteCfg.token || '';

  /* ---- cache first: use cached data regardless of token ---- */
  var cache = loadCache();
  if (cache) {
    hexo.log.info('[daily] Using cache from ' + cache.date + ', skip API requests.');
    return formatPage(cache.data, cache.date, cache.time);
  }

  /* ---- master switch & token check (only when no cache) ---- */
  if (!total) {
    hexo.log.info('[daily] Disabled by config (alapi.enable = false)');
    return emptyPage();
  }
  if (!token) {
    hexo.log.warn('[daily] Token not configured. Set alapi.token in themes/polaris/_config.yml.');
    return emptyPage();
  }

  /* ---- branch switches (default true if not configured) ---- */
  var fetchZaobao = !(cfg.zaobao && cfg.zaobao.enable === false);
  var fetchZhihu  = !(cfg.zhihu  && cfg.zhihu.enable  === false);
  var fetchWeibo  = !(cfg.weibo  && cfg.weibo.enable  === false);

  hexo.log.info('[daily] Fetching...');

  var tasks = [];
  if (fetchZaobao) tasks.push(fetchZaobaoFn(token));
  else             tasks.push(Promise.resolve({ news: [], motto: '', date: '' }));

  if (fetchWeibo)  tasks.push(fetchWeiboFn(token));
  else             tasks.push(Promise.resolve({ news: [] }));

  if (fetchZhihu)  tasks.push(fetchZhihuFn(token));
  else             tasks.push(Promise.resolve({ news: [] }));

  return Promise.all(tasks).then(function (results) {
    var zaobao = results[0] || { news: [], motto: '', date: '' };
    var weibo  = results[1] || { news: [] };
    var zhihu  = results[2] || { news: [] };

    var now = new Date();
    var dateStr = fmtDate(now);
    var timeStr = nowStr(now);
    var newsDate = zaobao.date || dateStr;

    hexo.log.info('[daily] Done — zaobao:' + zaobao.news.length +
      ' weibo:' + weibo.news.length + ' zhihu:' + zhihu.news.length);

    var data = { zaobao: zaobao, weibo: weibo, zhihu: zhihu };

    /* write cache */
    saveCache({ date: dateStr, time: timeStr, data: data });

    return formatPage(data, newsDate, timeStr);
  }).catch(function (err) {
    hexo.log.error('[daily] Fatal: ' + err.message);
    return emptyPage();
  });
});

/* ===== Page builder ===== */

function formatPage(data, newsDate, updateTime) {
  return {
    path: PAGE_PATH,
    layout: 'daily',
    data: {
      title: '每日资讯',
      newsDate: newsDate,
      updateTime: updateTime,
      zaobao: data.zaobao || { news: [], motto: '' },
      weibo:  data.weibo  || { news: [] },
      zhihu:  data.zhihu  || { news: [] }
    }
  };
}

/* ===== Data Fetchers ===== */

function fetchZaobaoFn(token) {
  var url = 'https://v3.alapi.cn/api/zaobao?' + querystring.stringify({
    token: token, format: 'json'
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
    return { news: news, motto: motto, date: d.date || '' };
  }).catch(function (err) {
    hexo.log.warn('[daily] zaobao failed: ' + err.message);
    return { news: [], motto: '', date: '' };
  });
}

function fetchWeiboFn(token) {
  var url = 'https://v3.alapi.cn/api/new/wbtop?' + querystring.stringify({
    token: token, num: 15
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
      if (!/^https?:\/\//i.test(rawUrl) || /javascript:/i.test(rawUrl)) rawUrl = '';
      return {
        title: item.hot_word || '',
        hot: item.hot_num,
        url: rawUrl
      };
    }).filter(function (item) { return item.title; });
    return { news: news };
  }).catch(function (err) {
    hexo.log.warn('[daily] weibo failed: ' + err.message);
    return { news: [] };
  });
}

function fetchZhihuFn(token) {
  var url = 'https://v3.alapi.cn/api/zhihu?' + querystring.stringify({
    token: token
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
    return { news: news };
  }).catch(function (err) {
    hexo.log.warn('[daily] zhihu failed: ' + err.message);
    return { news: [] };
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
      zaobao: { news: [], motto: '' },
      weibo: { news: [] },
      zhihu: { news: [] }
    }
  };
}

'use strict';

/**
 * Subscriptions Generator
 *
 * Fetches RSS/Atom feeds during `hexo generate` and renders them
 * on a /subscriptions/ page.
 *
 * Configuration (themes/polaris/_config.yml):
 *   subscriptions:
 *     default_limit: 3       # 每个源默认抓取条数
 *     page_title: 订阅        # 页面标题
 *     page_subtitle: '正在关注 %d 个博客'
 *     show_description: true # 是否显示描述
 *     show_count: true       # 是否显示更新条数
 *     timeout: 10000         # 请求超时（毫秒）
 *
 * Data source: source/_data/subscriptions.yml
 *
 *   subscriptions:
 *     - name: 博客名称
 *       url: https://example.com/feed.xml
 *       homepage: https://example.com          # 可选，博主主页（订阅名称将链接到此）
 *       limit: 3                               # 可选，默认使用 default_limit
 *       icon: 📡                               # 可选
 *       description: 简介                       # 可选
 */

var Parser = require('rss-parser');
var parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Polaris-Subscriptions/1.0'
  }
});

hexo.extend.generator.register('subscriptions', function () {
  var cfg = hexo.config.subscriptions || {};
  var themeCfg = (hexo.theme.config && hexo.theme.config.subscriptions) || {};
  // 合并：站点配置优先于主题配置
  for (var k in themeCfg) {
    if (cfg[k] === undefined) cfg[k] = themeCfg[k];
  }

  var pageTitle = cfg.page_title || '订阅';
  var pageSubtitle = cfg.page_subtitle || '正在关注 %d 个博客';
  var defaultLimit = cfg.default_limit || 3;
  var showDesc = cfg.show_description !== false;
  var showCount = cfg.show_count !== false;
  var timeout = cfg.timeout || 10000;

  // 读取数据文件
  var data = hexo.locals.get('data') || {};
  var subscriptions = (data.subscriptions && data.subscriptions.subscriptions) || [];

  function buildPage(customData) {
    return {
      path: 'subscriptions/index.html',
      layout: 'subscriptions',
      data: customData
    };
  }

  if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
    hexo.log.info('[subscriptions] No subscriptions data found, page will be empty.');
    return buildPage({
      title: pageTitle,
      feeds: [],
      updateTime: nowStr(),
      isEmpty: true,
      totalActive: 0
    });
  }

  hexo.log.info('[subscriptions] Fetching ' + subscriptions.length + ' feeds...');

  // 并发请求所有订阅源
  var promises = subscriptions.map(function (sub) {
    return fetchFeed(sub, defaultLimit, timeout);
  });

  return Promise.all(promises).then(function (feeds) {
    var totalActive = 0;
    feeds.forEach(function (f) { if (!f.error) totalActive++; });

    hexo.log.info('[subscriptions] Done — ' + totalActive + '/' + feeds.length + ' feeds fetched.');

    return buildPage({
      title: pageTitle,
      subtitle: pageSubtitle.replace('%d', totalActive),
      feeds: feeds,
      updateTime: nowStr(),
      isEmpty: false,
      totalActive: totalActive,
      showDescription: showDesc,
      showCount: showCount
    });
  }).catch(function (err) {
    hexo.log.error('[subscriptions] Fatal: ' + err.message);
    return buildPage({
      title: pageTitle,
      feeds: [],
      updateTime: nowStr(),
      isEmpty: true,
      totalActive: 0
    });
  });
});

/* ===== Feed Fetcher ===== */

function fetchFeed(sub, defaultLimit, timeout) {
  var limit = sub.limit || defaultLimit;
  var url = sub.url;

  if (!url) {
    return Promise.resolve({
      name: sub.name || '未知来源',
      url: '',
      icon: sub.icon || '⚠️',
      description: sub.description || '',
      homepage: sub.homepage || '',
      items: [],
      error: true,
      errorMsg: '未配置订阅源 URL'
    });
  }

  // 超时控制
  var fetchPromise = parser.parseURL(url);
  var timeoutPromise = new Promise(function (_, reject) {
    var id = setTimeout(function () {
      clearTimeout(id);
      reject(new Error('请求超时 (' + timeout + 'ms)'));
    }, timeout);
  });

  return Promise.race([fetchPromise, timeoutPromise]).then(function (feed) {
    var items = (feed.items || []).slice(0, limit).map(function (item) {
      return {
        title: item.title || '无标题',
        link: item.link || '#',
        pubDate: item.pubDate || item.isoDate || '',
        content: (item.contentSnippet || item.content || '').substring(0, 200)
      };
    });

    return {
      name: sub.name || feed.title || '未知来源',
      url: sub.url,
      icon: sub.icon || '📡',
      description: sub.description || '',
      homepage: sub.homepage || '',
      items: items,
      feedTitle: feed.title || '',
      feedDescription: feed.description || '',
      error: false
    };
  }).catch(function (err) {
    hexo.log.warn('[subscriptions] Failed to fetch: ' + sub.url + ' — ' + err.message);
    return {
      name: sub.name || '未知来源',
      url: sub.url,
      icon: sub.icon || '⚠️',
      description: sub.description || '',
      homepage: sub.homepage || '',
      items: [],
      error: true,
      errorMsg: err.message
    };
  });
}

/* ===== Helpers ===== */

function nowStr() {
  var d = new Date();
  var pad = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

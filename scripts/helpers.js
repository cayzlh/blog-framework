'use strict';

/**
 * Polaris Helpers
 *
 * Shared template helper functions.
 */

/**
 * Format a date string to MM-DD format
 * Used by subscriptions.ejs and other templates
 */
hexo.extend.helper.register('formatDate', function (dateStr) {
  if (!dateStr) return '';
  var date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  var month = String(date.getMonth() + 1).padStart(2, '0');
  var day = String(date.getDate()).padStart(2, '0');
  return month + '-' + day;
});

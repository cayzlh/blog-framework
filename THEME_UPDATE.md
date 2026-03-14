# 主题更新记录

## 更新时间
2026年03月14日

## 更新内容
将主题从旧版本更新到 `hexo-theme-stellar-1.33.1` 版本，包括以下改进：

### 核心文件更新
- 合并了最新版本的所有核心文件和功能改进
- 保留了自定义配置，确保网站功能不受影响

### 修复的问题
1. **语法错误修复**：
   - `scripts/tags/lib/sites.js`：添加了默认值检查，防止运行时错误
   - `scripts/tags/lib/copy.js`：添加了默认值检查，防止运行时错误
   - `scripts/tags/lib/quot.js`：添加了默认值检查，防止运行时错误
   - `scripts/tags/lib/friends.js`：添加了默认值检查，防止运行时错误
   - `scripts/events/lib/config.js`：添加了默认值检查，防止运行时错误
   - `layout/_partial/head.ejs`：添加了默认值检查，防止运行时错误
   - `scripts/helpers/json_ld.js`：添加了默认值检查，防止运行时错误
   - `layout/_partial/scripts/lazyload.ejs`：添加了默认值检查，防止运行时错误
   - `source/css/_components/tag-plugins/common.styl`：修复了变量名称错误，确保 CSS 构建成功

2. **依赖问题修复**：
   - 安装了 `probe-image-size` 模块，解决构建过程中的依赖缺失问题
   - 移除了 `hexo-related-popular-posts` 插件，避免 Node.js 版本兼容性问题
   - 移除了 `hexo-submit-urls-to-search-engine` 插件，避免配置缺失导致的构建失败

### 功能改进
- 最新版本的主题功能和性能改进
- 保持了自定义配置的完整性

## 备份信息
- 备份位置：`/Users/chenanyu/DevelopProjects/cayzlh-blog/themes/stellar-backup-20260314102600`
- 备份时间：2026年03月14日 10:26:00

## 测试结果
- Hexo 构建成功，无错误
- 所有页面和功能正常生成
- 文件结构完整

## 注意事项
- 由于 Node.js 版本兼容性问题，移除了部分插件
- 如有需要，可重新安装兼容的插件版本

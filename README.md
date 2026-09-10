<p align="center">
  <img alt="PT-Depiler Logo" width="100" src="./public/icons/logo/128.png?raw=true">
</p>

<h1 align="center">PT-Depiler Safari 移植版</h1>

<p align="center">
  基于 PT-Depiler 的 macOS Safari Web Extension 移植版本
</p>

<p align="center">
  <a href="../../actions/workflows/action_build_safari.yml"><img src="../../actions/workflows/action_build_safari.yml/badge.svg" alt="Safari Build"></a>
  <img src="https://img.shields.io/badge/macOS-13.0%2B-black?logo=apple" alt="macOS 13.0+">
  <img src="https://img.shields.io/badge/Safari-Web_Extension-blue?logo=safari" alt="Safari Web Extension">
  <img src="https://img.shields.io/badge/TypeScript-Vue-3178c6" alt="TypeScript and Vue">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License"></a>
</p>

## 项目简介

本项目是 [PT-Depiler](https://github.com/pt-plugins/PT-depiler) 的 Safari 移植版，在保留 Chrome、Firefox 构建目标的同时，增加了可在 macOS Safari 中运行的 Web Extension 和配套 Xcode 宿主应用。

PT-Depiler 基于 Manifest V3，是一款用于提高 PT 站点使用效率的浏览器扩展。它支持站点信息聚合、跨站搜索、种子下载、下载器管理和数据备份等功能。

> 本仓库不是 Safari 扩展商店安装包。首次使用需要在 macOS 上通过 Xcode 构建并签名；GitHub Actions 产物也是未签名的 Xcode 工程，不能直接双击安装。

## 主要功能

- 支持 NexusPHP、Unit3D、Gazelle 等多种 PT 站点框架
- 聚合多个站点的用户数据、分享率、上传量和做种信息
- 跨站搜索、批量操作及种子下载
- 支持 qBittorrent、Transmission、Deluge、ruTorrent、Aria2 和群晖 Download Station 等下载器
- 支持 WebDAV、Gist、CookieCloud、Google Drive、Dropbox 和 OWSS 等备份方式
- 保留上游 Chrome 与 Firefox 构建目标，便于同步更新和兼容性验证

支持的站点列表请查看 [PT Site Status](https://pt-plugins.github.io/monitor/)。

## Safari 适配说明

Safari 与 Chrome/Firefox 的 WebExtension API 存在差异，本移植版包含以下兼容处理：

- 使用统一的后台页面替代 Chrome 的 `offscreen` API
- 通过站点标签页中转部分需要登录态的请求，以适配 Safari 的 Cookie 限制
- 工具栏按钮使用弹出页打开主界面，并在用户操作后请求站点访问权限
- 本地种子下载使用后台请求和 Blob 保存作为回退方案
- 对批量下载和用户信息刷新进行串行化处理，提高 Safari 下的稳定性

当前限制：

- Safari 不支持扩展的 `omnibox` 声明，因此无法使用地址栏 `ptd` 快速搜索
- Safari 不提供与 Chromium 相同的 `downloads`、`notifications` 和 `offscreen` API，部分行为会使用回退实现
- 上游 CLI 原生消息桥只支持 Chrome/Firefox 的原生宿主注册方式，在 Safari 构建中不会显示
- 初次启用后需在 Safari 设置中授权扩展访问相应 PT 站点

更详细的实现差异见 [SAFARI.md](./SAFARI.md)。

## 环境要求

- macOS 13.0 或更高版本
- Safari
- 完整版 Xcode 及 Xcode Command Line Tools
- Node.js 23.7.0 或更高版本
- pnpm 10.14.0 或更高版本（项目锁定版本为 10.21.0）

确认 Xcode 命令行工具已指向完整版 Xcode：

```bash
xcode-select -p
xcodebuild -version
```

## 构建与安装

### 1. 获取代码并安装依赖

```bash
git clone https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
cd PT-depiler
pnpm install --frozen-lockfile
```

### 2. 构建 Safari 应用

```bash
pnpm build:safari-app
```

该命令会依次完成：

1. 构建 Safari WebExtension 到 `dist-safari/`
2. 从仓库内的 `safari/` 模板生成 `safari-project/PT-Depiler/`
3. 执行一次不含代码签名的 Debug 构建

生成的未签名应用位于：

```text
safari-project/DerivedData/Build/Products/Debug/PT-Depiler.app
```

### 3. 在 Xcode 中运行

```bash
open safari-project/PT-Depiler/PT-Depiler.xcodeproj
```

1. 在 Xcode 中为 `PT-Depiler` 和 `PT-Depiler Extension` 两个 Target 选择 Development Team
2. 选择 `PT-Depiler` Scheme，然后点击 Run
3. 打开 Safari 的“设置 > 扩展”，启用 PT-Depiler
4. 按需允许扩展访问 PT 站点

不要直接打开 `safari/PT-Depiler/PT-Depiler.xcodeproj`。该目录是没有 WebExtension 构建资源的模板，直接编译会出现 `_locales`、`assets`、`manifest.json` 等文件不存在的错误。必须先运行 `pnpm build:safari-project` 或 `pnpm build:safari-app`，然后打开生成的 `safari-project/PT-Depiler/PT-Depiler.xcodeproj`。

个人免费 Apple ID 可用于本机调试，但签名可能定期过期。发布到 Mac App Store 或分发给其他用户需要有效的 Apple Developer 证书、唯一 Bundle ID，并按 Apple 的要求完成归档、公证或商店提交。

## 常用构建命令

| 命令 | 用途 | 输出 |
| --- | --- | --- |
| `pnpm check` | TypeScript/Vue 类型检查 | 无 |
| `pnpm build:dist-safari` | 仅构建 Safari WebExtension | `dist-safari/` |
| `pnpm build:safari-project` | 构建 WebExtension 并生成 Xcode 工程 | `safari-project/` |
| `pnpm build:safari-app` | 生成工程并执行未签名 Xcode 构建 | `safari-project/DerivedData/` |
| `pnpm build:dist` | 构建 Chrome 版本 | `dist-chrome/` |
| `pnpm build:dist-firefox` | 构建 Firefox 版本 | `dist-firefox/` |

可通过环境变量修改生成工程的配置：

```bash
SAFARI_BUNDLE_ID=com.example.ptdepiler \
SAFARI_DEPLOYMENT_TARGET=13.0 \
pnpm build:safari-project
```

`SAFARI_BUNDLE_ID` 只能包含字母、数字、点和连字符。扩展 Target 会自动使用 `<Bundle ID>.Extension`。

## GitHub Actions

工作流文件为 [`.github/workflows/action_build_safari.yml`](./.github/workflows/action_build_safari.yml)，默认在 `safari` 分支的 Push、Pull Request 或手动触发时运行。工作流会进行类型检查、构建未签名应用，并上传压缩后的 Xcode 工程 `pt-depiler-safari-xcode`。

若你的默认分支不是 `safari`，请修改工作流中的 `push.branches` 和 `pull_request.branches`。

## 与上游同步

先提交改动或使用 `git stash` 保持工作区干净，然后执行：

```bash
pnpm update:upstream
pnpm check
pnpm build:safari-app
```

更新脚本默认拉取并合并 `origin/master`。如果上游仓库使用单独的 remote，可指定：

```bash
UPSTREAM_REMOTE=upstream UPSTREAM_BRANCH=master pnpm update:upstream
```

Safari 兼容层与上游代码发生冲突时，脚本会保留 Git 冲突，需人工检查后再提交。

## 目录说明

```text
safari/                 可提交的 Safari Xcode 工程模板
scripts/                Safari 工程生成、构建及上游同步脚本
src/                    WebExtension 源代码和 Safari 兼容层
dist-safari/            WebExtension 构建产物（不提交）
safari-project/         自动生成的完整 Xcode 工程及 DerivedData（不提交）
```

## 数据迁移

PT-Depiler 仅支持已适配站点的 PT-Plugin-Plus 历史用户数据迁移。请勿将 [PT-Plugin-Plus](https://github.com/pt-plugins/PT-Plugin-Plus) 或 [PT 助手](https://github.com/ronggang/PT-Plugin) 的配置文件直接导入 PT-Depiler。

## 致谢与许可证

本项目基于 [pt-plugins/PT-depiler](https://github.com/pt-plugins/PT-depiler) 移植，感谢上游项目及所有贡献者。问题反馈前请先确认问题是否仅在 Safari 中出现，并附上 macOS、Safari、Xcode 版本和复现步骤。

项目遵循 [MIT License](./LICENSE)。原项目版权归 [pt-plugins](https://github.com/pt-plugins) 及其贡献者所有。

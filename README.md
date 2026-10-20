<p align="center">
  <img alt="PT-Depiler Logo" width="100" src="./public/icons/logo/128.png?raw=true">
</p>

<h1 align="center">PT-Depiler Safari 移植版</h1>

<p align="center">
  基于 PT-Depiler 的 macOS Safari Web Extension 移植版本
</p>

<p align="center">
  <a href="../../actions/workflows/build.yml"><img src="../../actions/workflows/build.yml/badge.svg" alt="Build"></a>
  <a href="../../actions/workflows/upstream-sync.yml"><img src="https://img.shields.io/badge/upstream-sync-daily-blue" alt="Upstream Sync"></a>
  <img src="https://img.shields.io/badge/macOS-13.0%2B-black?logo=apple" alt="macOS 13.0+">
  <img src="https://img.shields.io/badge/Safari-Web_Extension-blue?logo=safari" alt="Safari Web Extension">
  <img src="https://img.shields.io/badge/TypeScript-Vue-3178c6" alt="TypeScript and Vue">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License"></a>
</p>

## 项目简介

本项目是 [PT-Depiler](https://github.com/pt-plugins/PT-depiler) 的 Safari 移植版，在保留 Chrome、Firefox 构建目标的同时，增加了可在 macOS Safari 中运行的 Web Extension 和配套 Xcode 宿主应用。

PT-Depiler 基于 Manifest V3，是一款用于提高 PT 站点使用效率的浏览器扩展。它支持站点信息聚合、跨站搜索、种子下载、下载器管理和数据备份等功能。

> 本仓库不是 Safari 扩展商店安装包。首次使用需要在 macOS 上通过 Xcode 构建并签名；GitHub Actions 产物是未签名（仅 ad-hoc 签名）的 App 压缩包，不能直接双击安装。

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

仓库带两条工作流，都以默认分支 `main` 为目标：

| 工作流 | 触发方式 | 作用 |
| --- | --- | --- |
| [`build.yml`](./.github/workflows/build.yml) | Push `main`、推送标签、Pull Request、手动 | 类型检查与站点定义校验，打包三端 WebExtension，在 macOS runner 上构建 Safari App；推送标签时发布 Release |
| [`upstream-sync.yml`](./.github/workflows/upstream-sync.yml) | 每天 09:20（北京时间）、手动 | 检查上游新版本，自动三方合并、验证构建并开 PR |

- `PT-Depiler-<版本>-<基线>-chrome-extension.zip` / `-firefox-extension.zip` / `-safari-extension.zip`：解压后即为可直接加载的扩展目录
- `PT-Depiler-<版本>-<基线>-macOS.app.zip`：在 GitHub macOS runner 上构建的宿主 App，未使用开发者证书，供测试使用。从浏览器下载后需先执行 `xattr -dr com.apple.quarantine PT-Depiler.app` 去除隔离标记；要在 Safari 中长期使用仍需用自己的开发者证书签名

发布新版本时推送一个与 `package.json` 中 `version` 同名的标签即可，例如 `git tag 1.3 && git push origin 1.3`，`build.yml` 会创建同名 Release 并附上全部产物。macOS job 在 Pull Request 上跳过以节省 runner 时间；若默认分支不是 `main`，请修改两个工作流中的 `branches`。

## 与上游同步

本仓库的历史是与上游没有共同祖先的压缩快照，因此同步不做 merge：`scripts/update-upstream.sh` 把「`.upstream-synced` 记录的上游提交 → 本次上游提交」的差异以三方合并方式打在 HEAD 上，只覆盖上游代码路径（`src`、`public`、`vite`、`vite.config.ts`、`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`patches`、`.dsh`），本仓库自建的 `scripts`、`safari`、`.github` 不受影响。

本地同步前先提交改动或用 `git stash` 保持工作区干净：

```bash
pnpm update:upstream              # 只改工作区和索引，不自动提交
pnpm install --no-frozen-lockfile
pnpm check
pnpm build:safari-app
```

同步目标默认为上游 `master` 最新提交，可用环境变量调整：

```bash
UPSTREAM_REF=<上游分支名或 40 位提交号> pnpm update:upstream   # 同步到指定版本
UPSTREAM_BRANCH=main pnpm update:upstream                      # 换分支
UPSTREAM_REPO=<地址> pnpm update:upstream                       # 换仓库
```

`package.json` 整体采用上游内容，再由 `scripts/sync-package-json.mjs` 写回移植版自己的 `version` 和 Safari 相关脚本，版本号差异因此不会造成冲突。其余无法自动合并的文件会留下冲突标记，脚本按 `conflicted-file: <路径>` 列出它们并以退出码 1 结束；本地跑完仍要人工确认，`.upstream-synced` 也保持不动（自动同步工作流带 `UPSTREAM_MARK_ON_CONFLICT=1`，那种情况下基线会随冲突一起推进，合并 PR 即视为同步完成）。上游标签不会被拉取，也不会被推送回本仓库。

### 自动跟随上游

`upstream-sync.yml` 每天检查一次上游。没有新版本时直接结束；有新版本时应用补丁，在 macOS runner 上依次跑 `pnpm check`、三端构建和 `pnpm build:safari-app`，全部通过就在 `codex/upstream-sync` 分支上开 PR 并默认自动 squash 合并。PR 上会跑一次 `build.yml`（跳过 macOS job），合并进 `main` 后再跑一次并上传新产物，所以同步提交里不要写 `[skip ci]`——squash 后的提交信息取自 PR 标题，写了会连打包一起跳过。验证失败或存在冲突时，PR 保持 Draft 并列出需要人工合并的文件。手动触发时可以指定上游分支或提交号，也可以取消自动合并。

你在同步分支上追加的解决提交会被接着用：分支上还有开启中的 PR 时，下一次运行会在你的提交之上继续打新的上游补丁，不会覆盖重来。

自动合并会把上游改动直接送进 `main`。想每次都人工确认，可以在手动触发时取消 `merge`，或者为 `main` 打开必需状态检查，让工作流改用自动合并队列。

前提：本仓库 Settings → Actions → General → Workflow permissions 需勾选 “Allow GitHub Actions to create and approve pull requests”，否则工作流的内置 token 无法创建 PR（工作流会在日志里明确指出这一点）。

## 目录说明

```text
.github/workflows/      打包与上游同步工作流
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

# Liss Works

Liss 的游戏、开发工具与交互实验作品集，使用 Astro、TypeScript、GSAP 与 Three.js。新版直接接管 [正式作品站](https://heroliss.github.io/liss-works/)，社区、账号与项目讨论继续由 [Liss Community](https://liss.pythonanywhere.com/) 提供。

## 展示内容

- 23 个作品的说明、真实截图、技术细节、源码与可用下载入口。
- 首页五项重点作品：Outpost、DubForge、SSFramework、玻璃海与 Gomoku。NomadWorkshop 仍在工程库中。
- 玻璃海使用海岸、日落、烟花等五张实机截图，设有独立风景展位和靠前的工程库位置；目前只展示图片与项目说明。
- 工程库支持搜索、分类和技术筛选，保留 URL 查询；详情包含灯箱、相关作品和直达项目讨论的入口。
- 交互实验包含可操作的路径算法、遗传演化与网页工具；关于页呈现创作工作室。

截图和文案以实际项目为准，不为尚未公开的项目添加源码、下载或体验地址。Windows 下载自动解析 GitHub 最新正式 Release，失败时保留发布页入口。

## 本地开发

```powershell
npm ci
npm run dev -- --port 4321
```

打开 <http://127.0.0.1:4321/>。工作区根目录的 `启动网站预览.ps1` 使用 `site/` 作为正式源码目录，先检查已有服务，再按需安装锁定依赖并启动。`site-next/` 为此次发布使用的设计分支检出目录，发布后 `site/` 同步为同一版本；不再提供旧版网站入口。

## 验证与发布

```powershell
npm run check
npm test
npm run test:paths
npm run test:releases
$env:SITE_BASE = '/liss-works/'
$env:SITE_URL = 'https://heroliss.github.io'
npm run build
npm run verify:dist
Remove-Item Env:SITE_BASE, Env:SITE_URL
```

`.github/workflows/deploy-pages.yml` 在 `main` 推送时运行同一组检查并发布 `dist/`。正式 URL 与旧链接保持不变；旧 `lihou-web` 和 `aoe4-autovillager-tool` 详情地址继续重定向。发布不改变论坛数据库、用户身份或邮件配置。

本地预览使用根路径，生产使用 `/liss-works/`。站内链接、媒体、字体、canonical、Open Graph 与 404 返回入口都应在生产路径构建后验证。浏览器验收覆盖桌面 Chromium、响应式视口、键盘、减少动态效果和无脚本阅读；不能据此推断真实手机、Safari 或所有设备性能。

新增中文后，从当前源码目录运行 `python scripts/prepare-media.py --fonts-only` 更新并解码验证字体子集。原始素材位于工作区 `captures/` 与各项目验证目录；`media-provenance.json`、`media-additions.json` 和 `public/fonts/FONT-SOURCES.json` 记录来源。不要清理原始截图、项目源码或社区数据。

设计与历史验证见 [DESIGN.md](DESIGN.md)、[README-NEXT.md](README-NEXT.md) 和工作区 `verification/site-next/`。本次发布与上线核验另存于 `verification/site-release-20261101/`。

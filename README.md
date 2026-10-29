# Liss Works · 深色新版试验

本目录是与旧版独立保留的 Taste Skill + GSAP 新版。请先阅读 [README-NEXT.md](README-NEXT.md)；当前设计权威为 [DESIGN-NEXT.md](DESIGN-NEXT.md)。旧版源码在 `../site/`，以下为保留的原站内容与运行说明。

当前工程库包含 20 个作品条目。首页优先呈现 SSFramework、DubForge，再连接游戏实机、实用工具与交互实验；工程库使用统一优先级，搜索与分类保留该顺序。Qt Labs、Text Lab、Systems Lab、NEX 与 Liss Blocks 覆盖 12 项早期桌面程序，配有技术短介绍、原生截图与自动跟随最新正式版的 Windows 下载。

Liss Community 详情以九张配图连接写作、可选邮箱与管理后台，说明内容恢复、变更确认和持久化设置。管理概览为线上实拍，设置图来自独立本地验证环境；不展示真实用户邮箱或私有配置。真实邮件送达与账户验收保留在工作区 `verification/site/mail-enable-20261024/`，后台验收在 `verification/community-admin/`。

AoE4 Flow · 帝国时代 4 自动化助手由原 AOE4 Flow Editor 更名。默认流程与识别素材面向帝国时代 4，可自定义图像识别、判断与键鼠节点；新仓库为 `heroliss/aoe4-flow`，旧作品地址继续重定向，下载跟随新仓库正式版。

所有提供 Windows 下载的工程均自动读取 GitHub 最新正式 Release 的匹配附件，同步版本和大小，不保留历史版本入口。早期下载组件验收见 `../verification/site/releases-20261024/acceptance.json`。

2026-10-24 后续更新：Intelligence × Cost 默认暗色已上线，封面、供应商高亮与点阵三图均改为线上暗色实拍；旧浅色素材保留归档。最新定向验收和媒体统计见 `../verification/intelligence-dark-20261024/final-site-checks.json`，早先 `../verification/site/highlights-20261024/final-acceptance.json` 保留为前一轮快照。

Liss Works 由 Liss 独立开发，使用 Astro + TypeScript 展示独立工程。正式站源码与发布资源集中在此目录；支持本地根路径预览，正式作品站部署在 [GitHub Pages](https://heroliss.github.io/liss-works/)，Liss Community 继续运行于 PythonAnywhere。

## 本地预览

在本目录执行：

```powershell
npm ci
npm run dev -- --port 4321
```

打开 http://127.0.0.1:4321/ 。开发预览当前已启动；再次打开无需重复启动服务。终端按 Ctrl+C 停止。

也可以在工作区根目录运行 `./启动网站预览.ps1`。脚本先检查端口，已有本站服务时直接提示地址，不启动重复进程。

## 页面

- `/`：两项并列重点工程、游戏与实用工具分区、轻量算法交互。
- `/projects/`：20 项工程，支持搜索、分类与技术标签，筛选保存在 URL。
- `/projects/<slug>/`：每项独立详情、项目缘起、功能、技术机制、使用示例、图库与关联作品；SSFramework / DubForge 有更完整的流程与设计说明。
- `/lab/`：Floyd 路径、可修改边权与矩阵、可复现种子的 GA 排序。
- `/about/`：简短介绍与 GitHub；`/404.html`：未找到页面。
- `/projects/lihou-web/`、`/projects/aoe4-autovillager-tool/`：兼容旧链接，分别重定向至 `/projects/liss-web/`、`/projects/aoe4-flow/`。

主导航与页脚的“交流”连接 Liss Community（记录与交流）；各项工程末尾的“交流想法”进入对应 `/projects/<slug>/talk/`，可分享心得、问题和后续想法。讨论功能由 Flask 站点提供，不在静态作品站复制账户或评论系统。社区源码为 `heroliss/liss-community`；作品详情、素材目录和讨论关联仍保留 `liss-web` key 与 slug，兼容原有链接。

## GitHub Pages 持续部署

`.github/workflows/deploy-pages.yml` 在 `main` 推送和手动运行时发布。使用 Node.js 24、锁定依赖和按 commit SHA 固定的 GitHub 官方 Actions；安装、Astro 检查、路径与下载测试、构建、静态资源校验全部成功后，才上传并部署 Pages 产物。部署任务单独持有 `pages: write` 和 `id-token: write` 权限，不需要另存部署密钥。GitHub 仓库的 Pages 发布源设为 GitHub Actions。

生产构建使用 `SITE_BASE=/liss-works/`、`SITE_URL=https://heroliss.github.io`；导航、媒体、旧项目重定向与 404 返回链接均包含站点前缀，canonical 和 Open Graph URL 指向正式作品域名。社区及各项目讨论链接保持 PythonAnywhere 地址，两站各自独立部署。

在本地复现正式产物：

```powershell
$env:SITE_BASE='/liss-works/'
$env:SITE_URL='https://heroliss.github.io'
npm run build
npm run verify:dist
Remove-Item Env:SITE_BASE
Remove-Item Env:SITE_URL
```

Pages Action 上传 `dist/` 本身，不要再套一层 `liss-works` 目录。默认本地开发仍为 `SITE_BASE=/`，地址不变；无需为本地预览配置环境变量。`src/lib/site-path.ts` 为站内导航、图片 / srcset、灯箱大图、视频与实验入口添加 base；外部网站、GitHub 和讨论链接保持原目标。Vite 自动处理 CSS 字体与脚本资源。旧博客项目链接的重定向目标也随 base 更新。

`verify:dist` 使用相同 `SITE_BASE` 检查所有生成页面的本地引用、片段锚点、CSS 字体及各项目讨论入口，防止子路径部署后误跳到社区根路径。`npm run test:paths` 验证 base、查询参数、锚点、外部 URL 和讨论地址。

## 检查和构建

```powershell
npm run check
npm test
npm run test:releases
npm run test:paths
npm run build
npm run verify:dist
npm run preview -- --port 4322
```

最后一条在独立端口预览 `dist/`，无需停止已有 4321 开发服务；使用前请确认 4322 未被占用。静态产物不依赖服务器端业务或数据库。所有导航均为普通链接，主要内容可在无 JavaScript 时阅读；实验操作、灯箱与筛选需要脚本。

最新工具接入与正式 base 构建记录见 `../verification/site/web-tools-20261025/`；NEX 推荐与社区初始帖分别见 `../verification/nex-next5/`、`../verification/community-starter-posts/`。旧下载组件、灯箱和路由快照继续保留。浏览器验收范围是桌面 Chromium 和响应式视口模拟。

## 自动下载入口

`src/components/ProjectDownload.astro` 为项目详情提供统一下载入口。`src/lib/github-release.ts` 匿名查询 GitHub `/releases/latest`，只接受正式 Release 中唯一匹配的 Windows ZIP / EXE，同时更新下载地址、tag 和附件字节数。缓存 10 分钟；查询最长 8 秒。无脚本、超时、限流或附件缺失时保留 `/releases/latest` 链接，不显示过期版本数据。页面用法不再写死安装包大小或 Release 版本。

新增项目或更改发布附件命名时，更新相应数据模块的 `download.repository` 与 `download.assetPattern`，运行 `npm run test:releases`；若有多个匹配附件，页面会转向最新发布页供访客选择。规则兼容稳定名称和带数字版本的 Windows 文件名。

## 内容与媒体

- `src/data/projects.ts`：工程库与原有 15 项的内容和图片顺序；导入新增桌面作品。
- `src/data/restored-projects.ts`、`restored-bundles.ts`：5 项桌面作品、合集介绍与原生截图顺序。
- `src/data/web-projects.ts`：mkfun 与 Liss Utilities 的作品介绍、技术主题和浏览器体验入口；当前共展示 22 项工程。
- `src/data/project-image.ts`：统一的全幅图片与响应式变体路径。
- `src/data/stories/`：项目缘起、技术职责、流程和实现介绍；`story-types.ts` 定义内容结构。
- `src/components/ProjectEngineering.astro`：截图与精简技术要点；详情页使用简短导航、技术职责与流程。
- `src/data/story-media.ts`：技术主题配图，已用于正文的图不再重复放入图库。
- `src/data/project-signatures.ts`：各项工程的技术方向、设计主张与三项关键能力；同一份数据用于详情、首页与搜索。
- `src/components/FrameworkDiagram.astro`：SSFramework 架构示意，小屏与平板切换为可读的文字流程。
- `src/styles/global.css`：配色、布局与响应式样式。
- `src/components/LabWorkbench.astro`：网页算法说明移植；算法源在 `src/lib/`。
- `public/media/`：选图的全幅 WebP 与响应式变体，另有地图 MP4；不包含研究目录、用户数据库、词向量模型或原始录像帧。数量和字节数以媒体来源清单为准。
- `public/fonts/`：自托管 Rajdhani、Noto Sans SC 子集及官方 OFL。
- `media-provenance.json`：原件 SHA、导出尺寸、字节数、保真检查和字体覆盖。

源截图原件仍在上级 `captures/`，本网站未改动它们。工具全尺寸截图无损，游戏画面使用 WebP quality 92，保持完整构图。素材数据与离线预览在工程详情简短注明。

中文字库随文案重新生成，并验证所需汉字覆盖与 WOFF2 解码；具体码点、体积与来源见 `media-provenance.json`。历史截图保留归档，新增原件逐张核对 SHA-256。旧博客发布 WebP 位于工作区 `artifacts/site-retired-media-20261024/lihou-web/`，当前页面没有旧媒体引用。

作品入口已接入 Outpost / LearnOpenGL 正式 Windows Release 与 [Liss Community 正式站](https://liss.pythonanywhere.com/)。社区的内容和账户数据继续保存在 PythonAnywhere，免费服务需每月控制台续期，当前续期日期为 2026-11-23。作品站使用 GitHub Pages，静态发布不复制或迁移社区数据库；实际线上验收以工作区最新交接记录为准。

修改中文文案后，在工作区根目录执行 `python site/scripts/prepare-media.py --fonts-only` 更新字库，然后重新构建。完整重导出可用同脚本（需要当前机器已有的 Pillow/fontTools、Node，原始素材路径以工作区为准）。站点本身只需要 Node.js 与 npm。

补充某个工程的选图后，可执行 `python site/scripts/prepare-media.py --media-only --repo SSFramework`；其余工程的原件及已有导出会逐一核对 SHA-256，再保留复用。

## 独立网页工具

`public/tools/mkfun/` 与 `public/tools/utilities/` 保存两个源仓库的静态导出，全部资源使用相对路径，可在 Pages 子路径运行。后者含随包 Unicode 数据与第三方许可；文件处理均在浏览器中完成，不上传到社区。

`tools-provenance.json` 记录源码仓库、提交、发行版和逐文件 SHA-256。`npm run build` 先验证导出未变，再由 `finalize-tools.mjs` 只为 `dist/` 的入口添加宿主 canonical / Open Graph 与无脚本提示。TypeScript 检查不重复扫描压缩后的外部工具包；这两份实现的核心测试、构建和浏览器验收由各自源仓库负责，主站另验收实际部署路径与交互。

第三方字体按各自 OFL 使用。工程素材来自各个仓库；未额外添加统一源码授权。


源码仓库：[heroliss/liss-works](https://github.com/heroliss/liss-works)；社区源码：[heroliss/liss-community](https://github.com/heroliss/liss-community)。两部分分别维护，通过导航和项目讨论入口互通。

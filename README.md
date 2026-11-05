# Liss Works · 2.0

Liss 的游戏、开发工具与交互实验作品集，使用 Astro、TypeScript、GSAP 与 Three.js。新版直接接管 [正式作品站](https://heroliss.github.io/liss-works/)，社区、账号与项目讨论继续由 [Liss Community](https://liss.pythonanywhere.com/) 提供。

## 展示内容

- 24 个作品的说明、真实截图、技术细节、源码与可用下载入口。
- 首页五项重点作品：盘序、DubForge、SSFramework、玻璃海与 Gomoku；Outpost 保留在中部游戏区，NomadWorkshop 仍在工程库中。
- 首页的盘序展区就是盘序的真实窗口：四个步骤（一键体检、分成三组、讲清楚、清理并记下）里，被说到的部分从截图上浮起来，悬停看说明，点一下看原图；切换步骤时页面不会跳动。数字与截图来自真实盘序在演练环境中的一次体检。
- 盘序、DubForge 与 SSFramework 的详情页用首页的同一个特殊展示开场；玻璃海详情页以同一片水面开场。
- 首页中部展示 Liss Blocks 的真实落块棋盘与轻量绘制氛围，底部 NomadWorkshop 展示保留。
- 玻璃海首页以填色轮廓绘制的伪3D海岛、水面与倒影组成独立展位，支持平缓的鼠标转向、涟漪、时光选择和暂停；不使用3D模型或截图投影。详情保留五张实机截图，无视频。
- 工程库顶部以 CSS 透视圆柱转盘浏览全部项目，正面约七张截图同时可读，支持拖动、惯性、触控板横向滑动、Shift + 滚轮和方向键，普通纵向滚轮照常滚动页面；下方保留搜索、分类和技术筛选以及 URL 查询。玻璃海使用与其他工程相同的普通图版。
- 各项目使用固定身份配色，首页、工程库和详情同步；源码检查约束颜色唯一性和实色表面对比度，图片上的最终效果仍通过浏览器验收。
- 交互实验包含可操作的路径算法、遗传演化与网页工具；关于页呈现创作工作室。

截图和文案以实际项目为准，不为尚未公开的项目添加源码、下载或体验地址。Windows 下载自动解析 GitHub 最新正式 Release，失败时保留发布页入口。

## 本地开发

```powershell
npm ci
npm run dev -- --port 4321
```

打开 <http://127.0.0.1:4321/>。工作区根目录的 `启动网站预览.ps1` 使用 `site/` 作为正式源码目录，先检查已有服务，再按需安装锁定依赖并启动。请在 `site/` 继续维护；`site-next/` 仅保留早期设计检出与历史资料，不作为当前版本入口。

## 验证与发布

```powershell
npm run check
npm test
npm run test:paths
npm run test:releases
npm run test:atoll
npm run test:atoll-transfer
npm run test:atlas
npm run test:palette
$env:SITE_BASE = '/liss-works/'
$env:SITE_URL = 'https://heroliss.github.io'
npm run build
npm run verify:dist
Remove-Item Env:SITE_BASE, Env:SITE_URL
```

`.github/workflows/deploy-pages.yml` 在 `main` 推送时运行同一组检查并发布 `dist/`。`test:atlas` 包含环形坐标/惯性检查以及实际控制器的键盘、手势取消、减少动态、销毁测试；`test:palette` 检查 23 个项目的身份配色和实色对比，`test:atoll-transfer` 检查压缩星空加载在网络或解码失败时回退原始资源。正式 URL 与旧链接保持不变；旧 `lihou-web` 和 `aoe4-autovillager-tool` 详情地址继续重定向。发布不改变论坛数据库、用户身份或邮件配置。

本地预览使用根路径，生产使用 `/liss-works/`。站内链接、媒体、字体、canonical、Open Graph 与 404 返回入口都应在生产路径构建后验证。浏览器验收覆盖桌面 Chromium、响应式视口、键盘、减少动态效果和无脚本阅读；不能据此推断真实手机、Safari 或所有设备性能。

新增中文后，从当前源码目录运行 `python scripts/prepare-media.py --fonts-only` 更新并解码验证字体子集。原始素材位于工作区 `captures/` 与各项目验证目录；`media-provenance.json`、`media-additions.json` 和 `public/fonts/FONT-SOURCES.json` 记录来源。不要清理原始截图、项目源码或社区数据。

当前设计见 [DESIGN.md](DESIGN.md)，版本变化见 [CHANGELOG.md](CHANGELOG.md)。[README-NEXT.md](README-NEXT.md)、[DESIGN-NEXT.md](DESIGN-NEXT.md) 和工作区 `verification/site-next/` 保留历史。玻璃海接入及 UI 发布证据在 `verification/atoll-water-scene-20261101/`，卡片环与主题调整在 `verification/portfolio-ring-20261102/`；2.0 阶段收尾记录在 `verification/site-release-20261105/`。

## 维护与清理

`dist/`、`.astro/` 与 `node_modules/` 是可重建生成物，不提交到源码仓库。清理前先完成验收并保留本轮报告；执行 `npm ci` 和生产路径构建即可恢复。截图原图、`public/media/`、`public/play/`、来源清单、字体许可和原工程源码属于交付内容，不能当作缓存删除。临时浏览器截图、追踪与服务日志放在工作区 `verification/`，不要放进公开站点资源目录。


玻璃海在线体验位于 `play/glass-atoll/`，与作品主页共用 Pages 发布流程。`glass-atoll-provenance.json` 固定运行快照及输入/输出 SHA-256；更新时运行 `python scripts/vendor-glass-atoll.py`（默认读取同级原工程）。只收录运行模块、资源和署名，导出脚本只读原工程。在线版明确关闭原生显示器检测和需要服务端生成的 ACES 目标，保留固定目标及正常场景；星空数据采用无损压缩传输，并保留原始二进制回退。在线版默认采用现有低画质预设，访客可自行提高；银河与星表（约 53 MB）不再阻塞白昼首帧，首帧后空闲、黄昏或选择夜间场景时才下载，夜间预设会等待其就绪；本地无压缩测量的首帧前字节为 9,848,537（改前 62,957,961），详见原工程 `verification/night-asset-deferral-20261105/ACCEPTANCE.md`。场景控制界面来自原工程的 `viewer-ui.css`，以较小的半透明控制条呈现，详细面板按需打开。

运行界面按探索顺序组织：桌面常用时刻可直接选择，机位提供双列缩略图；底部直接发射所选烟花，有排队或自动燃放时可直接停止后续。画面设置默认进入画质页，帧率诊断移入设置；`?` / 工具栏帮助可直接打开操作说明，Esc 收起面板。手机默认保持较小控制条，展开设置时互斥。

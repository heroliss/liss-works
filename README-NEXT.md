# Liss Works · 新版试验

新版使用 GSAP 官方技能，结合 Taste Skill v2、Frontend Design 与 Impeccable，保留 Astro + TypeScript 和深色模式。当前 v4 让每个作品形成自己的场景：丰富的空间排版、持续但可暂停的作品动效与实时鼠标反馈共同服务于真实内容。源码独立位于 `site-next/`，旧版 `../site/` 的源码和 Git 历史保留；新版仅在本地开发对照，尚未替换或发布到原站。

## 预览与对照

- [新版](http://127.0.0.1:4322/)
- [旧版](http://127.0.0.1:4321/)
- [对照台](http://127.0.0.1:4320/)：切换页面、并排比例及桌面/手机视口。

在 `site-next/` 执行 `npm ci`，然后 `npm run dev -- --port 4322`。旧版在 `../site/` 使用同样命令并指定 4321。对照台在 `../comparison/` 执行 `python -m http.server 4320 --bind 127.0.0.1`。工作区根目录 `启动新旧版对照.ps1` 可启动或复用这三个预览。

## v4 内容与实现

保留首页、工程库、22 项工程详情、关于页、交互实验和 404，以及原有数据、源码、下载、交流、筛选与算法功能。独立网页工具仍使用各自原实现。

- 撤下 v3 的独立信号实验。现有算法实验页继续保留，首页互动围绕作品本身展开。
- 首屏三主题为 Outpost 珊瑚、DubForge 青蓝、SSFramework 黄绿。主屏带有轻微持续活性；悬停或键盘聚焦控制即可切换画面、说明、颜色与实际链接。DubForge 流程同样无需点击即可反馈，触屏仍可直接操作按钮。
- 图片上不再添加探索或放大文字 badge。可缩放的真实图片使用原生 `zoom-in` 指针，保留灯箱与键盘操作。
- `PLAY / BUILD / EXPERIMENT / REPEAT` 采用两个相同分组无缝循环。旁侧“暂停动态”是全局控制，同时暂停字带、首屏活性、SSFramework 实际路径循环、DubForge 流程轮转与游戏外围 atmosphere。
- Outpost 的扫描弧与短弹道、Nomad 的风向曲线与甲板热点、Gomoku 的外围搜索分支都实时回应精细指针。中央真实 UI 留出保护空间，不绘制虚构棋局或无关粒子；触摸不拦截滚动。
- 五个重点详情页采用不同构图与风格：SSFramework 黄绿架构、DubForge 青蓝编辑工作流、Outpost 珊瑚战场、Nomad 浅绿漂浮甲板、Gomoku 紫米博弈。其他工程继续保留原有信息与有效入口。
- 所有持续循环在离屏、页面隐藏、全局暂停或减少动态效果时停止。动态偏好变化即时生效，减少动态效果时清空装饰画布并保留静态内容与即时选择；页面离开时清理监听器、观察器与动画。无 JavaScript 或 Canvas 不可用时仍可阅读截图、说明和链接。

设计说明见 `DESIGN.md`。主要样式位于 `src/styles/new-theme.css`、`home-next.css`、`expressive-home.css`、`interior.css` 和 `project-worlds.css`；动效由 `src/scripts/motion.ts` 组织，包含 `portfolio-motion.ts`、`expressive-motion.ts`、`project-motion.ts` 和 `project-atmosphere.ts`。全局暂停状态通过 `documentElement.dataset.motionPaused` 与 `portfolio:motion-state` 事件同步。

v1 提交 `75a79327129c73e407eaf9053d24de69736b5260`、v2 提交 `4948588`、v3 提交 `70ebe45` 均可回看，对应历史证据保留在 `../verification/site-next/`。首轮 `.taste-skill/direction.json`、`.taste-skill/brief.md` 作为历史探索记录保留。技能位于工作区 `../.agents/skills/`，版本、来源、许可证和逐文件校验记录见 `../verification/site-next/skills-provenance.json`；未修改已有全局技能。

## 验证与字体更新

验证命令：`npm run check`、`npm test`、`npm run test:releases`、`npm run test:paths`、`npm run build`、`npm run verify:dist`。GitHub Pages 子路径验证使用 `SITE_BASE=/liss-works-next/` 和 `SITE_URL=https://heroliss.github.io`；默认本地预览使用根路径。

当前截图、实际交互、动态偏好、无脚本与旧版完整性验收材料集中在 `../verification/site-next/v4/`，实际通过与限制以各报告为准。Taste 的主观 house rules 曾产生 `stylefail`，历史报告如实保留，v4 结果按本轮报告记录，不声称其整体 gate 已通过；构建检查、运行交互和视觉复核分别记录。

新增中文文案后，必须从 **`site-next/` 目录**运行：

```powershell
python scripts/prepare-media.py --fonts-only
```

这只更新新版字体子集与来源记录。不要从旧版目录运行同名脚本，以免误改保留的旧站。

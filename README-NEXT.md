# Liss Works · 新版试验

新版使用 GSAP 官方技能，结合 Taste Skill v2、Frontend Design 与 Impeccable，保留 Astro + TypeScript 和深色模式。当前 v3 延续“夜间创作工作台”，采用更大胆的错位排版、局部章节色场与图片尺度变化，并加入实时鼠标互动。源码独立位于 `site-next/`，旧版 `../site/` 的源码和 Git 历史保留，新版尚未替换原站部署。

## 预览与对照

- [新版](http://127.0.0.1:4322/)
- [旧版](http://127.0.0.1:4321/)
- [对照台](http://127.0.0.1:4320/)：切换页面、并排比例及桌面/手机视口。

在 `site-next/` 执行 `npm ci`，然后 `npm run dev -- --port 4322`。旧版在 `../site/` 使用同样命令并指定 4321。对照台在 `../comparison/` 执行 `python -m http.server 4320 --bind 127.0.0.1`。工作区根目录 `启动新旧版对照.ps1` 可启动或复用这三个预览。

## v3 内容与实现

保留首页、工程库、22 项工程详情、关于页、交互实验和 404，以及原有数据、源码、下载、交流、筛选与算法功能。独立网页工具仍使用各自原实现。

- 首屏三主题：Outpost 珊瑚、DubForge 青蓝、SSFramework 黄绿。主屏切换联动标题颜色、说明与实际链接；实时景深、局部光面、磁吸按钮和探索标签回应指针。
- 独立 Canvas 信号实验包含 28 节点、40 边及 Dijkstra 最短路径；静态 SVG 后备与动态版本共享图数据。
- 章节以不同的标题位置、截图规模和暗色场展开，配合有界滚动、倾斜字带及章节导航。手机有独立构图，保留原生滚动与系统指针。
- 动态偏好变化即时生效；减少动态效果时保留静态内容和可操作选择。无 JavaScript 或 Canvas 不可用时提供静态网络及链接，隐藏无效动态控件。离屏、隐藏及页面离开时暂停或清理动画资源。

设计说明见 `DESIGN.md`。主要样式位于 `src/styles/new-theme.css`、`home-next.css`、`expressive-home.css` 和 `interior.css`；动效位于 `src/scripts/motion.ts`、`portfolio-motion.ts`、`expressive-motion.ts` 和 `signal-field.ts`，共享网络数据位于 `signal-field-data.ts`。

v1 提交 `75a79327129c73e407eaf9053d24de69736b5260`、v2 提交 `4948588` 均保留。首轮 `.taste-skill/direction.json`、`.taste-skill/brief.md` 作为历史探索记录保留。技能位于工作区 `../.agents/skills/`，版本、来源、许可证和逐文件校验记录见 `../verification/site-next/skills-provenance.json`；未修改已有全局技能。

## 验证与字体更新

验证命令：`npm run check`、`npm test`、`npm run test:releases`、`npm run test:paths`、`npm run build`、`npm run verify:dist`。GitHub Pages 子路径验证使用 `SITE_BASE=/liss-works-next/` 和 `SITE_URL=https://heroliss.github.io`；默认本地预览使用根路径。

当前截图、实际交互、动态偏好、无脚本与旧版完整性证据集中在 `../verification/site-next/v3/`。Taste 对渐变、阴影、eyebrow、hairline 的主观 house rules 仍有失败项，报告如实保留，不声称其整体 gate 已通过；构建检查与视觉复核分别记录。

新增中文文案后，必须从 **`site-next/` 目录**运行：

```powershell
python scripts/prepare-media.py --fonts-only
```

这只更新新版字体子集与来源记录。不要从旧版目录运行同名脚本，以免误改保留的旧站。

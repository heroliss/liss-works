# Liss Works · 新版试验

新版使用 **Taste Skill v2 + GSAP 官方技能**，保持 Astro + TypeScript，整体为深色模式。源码独立保存在 `site-next/`；旧版 `../site/` 的源码和 Git 历史保留。

## 预览与对照

- 新版：http://127.0.0.1:4322/
- 旧版：http://127.0.0.1:4321/
- 对照台：http://127.0.0.1:4320/ —— 可切换页面、并排比例和桌面/手机视口。

在新版目录执行 `npm ci`，然后 `npm run dev -- --port 4322`。旧版在 `../site/` 使用同样命令并指定 4321。对照台在 `../comparison/` 执行 `python -m http.server 4320 --bind 127.0.0.1`。根目录 `启动新旧版对照.ps1` 可自动启动或复用这三个预览。

## 内容与实现

新版覆盖首页、工程库、22 项工程详情、关于页、交互实验及 404。原项目数据、源代码入口、下载、讨论、筛选与实验保留。独立网页工具仍使用各自原实现。主要设计在 `src/styles/new-theme.css`、`home-next.css` 和 `interior.css`，动效在 `src/scripts/motion.ts`。

设计来源为 `.taste-skill/direction.json`，约束与文案记录为 `.taste-skill/brief.md`，当前设计说明见 `DESIGN-NEXT.md`。技能安装在工作区 `.agents/skills/`，版本、来源、许可证和逐文件校验记录为 `../verification/site-next/skills-provenance.json`。本轮核对上游默认分支后锁定提交，不修改已有全局技能。

## 验证

`npm run check`、`npm test`、`npm run test:releases`、`npm run test:paths`、`npm run build`、`npm run verify:dist`。GitHub Pages 可用 `SITE_BASE=/liss-works-next/` 和 `SITE_URL=https://heroliss.github.io` 构建验证。默认本地预览使用根路径。

真实浏览器、Taste 生产渲染检查、新旧截图和原版完整性证据集中保存在 `../verification/site-next/`。新版尚未替换原站部署。

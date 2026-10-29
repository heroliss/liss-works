# Liss Works · v5 新版试验

新版使用 GSAP 官方技能，结合 Taste Skill v2、Frontend Design 与 Impeccable，保留 Astro + TypeScript 和深色模式。v5 将 22 项工程全部纳入各自主题，让三维舞台、排版、色彩与运动围绕真实作品展开。源码独立位于 `site-next/`；旧版 `../site/` 的源码和 Git 历史保留，新版尚未替换或发布到原站。

## 预览与对照

- [新版](http://127.0.0.1:4322/)
- [旧版](http://127.0.0.1:4321/)
- [对照台](http://127.0.0.1:4320/)：切换页面、并排比例及桌面/手机视口。

在 `site-next/` 执行 `npm ci`，然后 `npm run dev -- --port 4322`。旧版在 `../site/` 使用同样命令并指定 4321。对照台在 `../comparison/` 执行 `python -m http.server 4320 --bind 127.0.0.1`。工作区根目录 `启动新旧版对照.ps1` 可启动或复用这三个预览。

## v5 内容与交互

保留首页、工程库、22 项详情、关于页、交互实验、404 及原有资料、源码、下载、交流、筛选和算法功能；独立网页工具仍使用原实现。

- 首屏信息移到左侧，桌面项目名约 53px、摘要 18px、选择器 24px。右侧原生按钮卡片经单击、Enter 或 Space 选择前景，不跳页；focus 只显示 outline。详情由独立“查看项目” CTA 打开。
- 当前作品采用 `z-index:12`，三维舞台最大指针倾斜约 10° / 13°。轻斜 −2.4° 的横幅将外层反向指针移动（水平最多约 55px）与内层连续文字循环分开。
- 五个重点详情及其余 17 页均有独立主题，完整 22 项主题表见 `DESIGN.md`。首页索引、工程库、继续探索卡片和详情颜色由 `src/data/project-worlds.ts` 统一。
- 详情真实图片配内容相关的外围 SVG 与约 7° / 9° 三维平面响应，不编造界面、数字或结果。同源页面在浏览器支持时使用原生 View Transition 衔接共享封面，普通导航与历史保持有效。
- 不在图片上添加探索、放大等文字提示或跟随指针的文字标签。全局暂停、离屏、页面隐藏及减少动态效果均会停止相应运动；偏好变化即时生效，页面离开清理资源。手机与无 JavaScript 状态保留自然阅读和有效入口。

样式由 `src/styles/project-worlds.css`、`project-worlds-tools.css`、`project-worlds-labs.css` 及首页样式共同组织。动效由 `src/scripts/motion.ts` 接入 `portfolio-motion.ts`、`expressive-motion.ts`、`project-motion.ts`、`project-atmosphere.ts`、`detail-world-motion.ts`；封面连续性在 `site-continuity.ts`。全局暂停通过 `documentElement.dataset.motionPaused` 与 `portfolio:motion-state` 同步，并以 `sessionStorage` 在当前标签页内跨页面保留选择；存储不可用时安全回退，BFCache 返回会在重建动效前恢复选择。

历史检查点：v1 `75a79327129c73e407eaf9053d24de69736b5260`、v2 `4948588`、v3 `70ebe45`、v4 `1035e69`。对应历史证据与首轮 `.taste-skill/` 方向记录保留。技能位于工作区 `../.agents/skills/`；版本、来源、许可证和校验见 `../verification/site-next/skills-provenance.json`，未修改已有全局技能。

## 验证与字体更新

验证命令：`npm run check`、`npm test`、`npm run test:releases`、`npm run test:paths`、`npm run build`、`npm run verify:dist`。GitHub Pages 子路径验证使用 `SITE_BASE=/liss-works-next/` 和 `SITE_URL=https://heroliss.github.io`；本地默认根路径。

当前验收证据在 `../verification/site-next/v5/`。已通过 22 个详情 × 4 个视口的 88 组几何检查，mkfun 标题孤字换行已修复；首屏原生卡片的首次单击、Enter / Space 已实测不导航。完整交互结果与限制按各报告记录，不声称全部浏览器 FPS 或完整 Taste gate 通过。Taste 主观 house rules 及其他检测提示均保留，构建、几何、交互与视觉结论分别记录。

新增中文文案后，必须从 **`site-next/` 目录**运行：

```powershell
python scripts/prepare-media.py --fonts-only
```

这只更新新版字体子集与来源记录，不要从旧版目录运行同名脚本。

# Liss Works · v6 新版试验

新版使用 GSAP 官方技能，结合 Taste Skill v2、Frontend Design 与 Impeccable，保留 Astro + TypeScript 和深色模式。v6 用五张作品卡片区分开场与项目信息，SSFramework 与 DubForge 则各自成为紧凑、可切换的主题场景。22 项工程继续保留独立的排版、色彩与运动。源码独立位于 `site-next/`；旧版 `../site/` 的源码和 Git 历史保留，新版尚未替换或发布到原站。

## 预览与对照

- [新版](http://127.0.0.1:4322/)
- [旧版](http://127.0.0.1:4321/)
- [对照台](http://127.0.0.1:4320/)：切换页面、并排比例及桌面/手机视口。

在 `site-next/` 执行 `npm ci`，然后 `npm run dev -- --port 4322`。旧版在 `../site/` 使用同样命令并指定 4321。对照台在 `../comparison/` 执行 `python -m http.server 4320 --bind 127.0.0.1`。工作区根目录 `启动新旧版对照.ps1` 可启动或复用这三个预览。

## v6 内容与交互

保留首页、工程库、22 项详情、关于页、交互实验、404 及原有资料、源码、下载、交流、筛选和算法功能；独立网页工具仍使用原实现。

- 首屏呈现 Outpost、DubForge、SSFramework、NomadWorkshop、Gomoku 五张真实作品卡片。开场标题与介绍保持自己的空间，项目选择器、名称、摘要和“查看项目”组成下方独立信息区，维持可读字号。
- 点击或用 Enter / Space 激活非当前卡片，只将它切到前景；激活已经位于前景的卡片，会进入对应详情。卡片获得焦点时保持位置并显示 outline；名称选择器支持悬停、聚焦与点击切换，“查看项目”也可直接进入当前工程。
- SSFramework 是黄绿的游戏框架连接背板：单个大图窗口配四个插槽，切换时以拔出、移动、接入线缆衔接架构图、运行诊断、工具中心与实际生成代码。截图完整保留、支持灯箱，每幅都有清楚的标题与 18px 说明。
- DubForge 是青蓝的紧凑视频工厂：同一窗口展示九个真实工作区，以工序控制切换画面和说明，机架、轨道与控制台带来景深。上屏评论与投稿明确标为按需选用。
- 三维舞台与场景按精细指针回应，轻斜横幅将外层空间移动与内层 `PLAY / BUILD / EXPERIMENT / REPEAT` 双分组连续循环分开。
- 五个重点详情及其余 17 页均有独立主题，完整 22 项主题表见 `DESIGN.md`。首页索引、工程库、继续探索卡片和详情颜色由 `src/data/project-worlds.ts` 统一。
- 详情真实图片配内容相关的外围 SVG 与约 7° / 9° 三维平面响应，不编造界面、数字或结果。同源页面在浏览器支持时使用原生 View Transition 衔接共享封面，普通导航与历史保持有效。
- 不在图片上添加探索、放大等文字提示或跟随指针的文字标签。全局暂停、离屏、页面隐藏及减少动态效果均会停止相应运动；偏好变化即时生效，页面离开清理资源。手机与无 JavaScript 状态保留自然阅读和有效入口。

SSFramework 架构图来自原仓库文档；运行诊断和工具图采自 Outpost 原生窗口，生成代码来自明确标注的自制 UI 绑定示例。DubForge 九张图为原程序真实生产界面中的隔离演示项目补拍，使用自写双语稿与自绘视频，保留原始截图字节；画面展示待制作状态，并不表示已经执行推理、配音、成片或投稿。来源与核验见 `../verification/site-next/v6/dubforge-nine-step-captures.json`。

样式由 `src/styles/project-worlds.css`、`project-worlds-tools.css`、`project-worlds-labs.css`、`framework-showcase.css`、`dubforge-workflow.css` 及首页样式共同组织。动效由 `src/scripts/motion.ts` 接入各项目模块及 `showcase-narratives.ts`；封面连续性在 `site-continuity.ts`。场景的显示、切换与空间运动同步遵守全局暂停、离屏、页面隐藏和减少动态效果；无 JavaScript 时提供自然图集与有效链接。暂停状态通过 `documentElement.dataset.motionPaused` 与 `portfolio:motion-state` 同步，并以受保护的 `sessionStorage` 在当前标签页内跨完整导航保留，BFCache 返回时先恢复选择再重建动效。

历史检查点：v1 `75a79327129c73e407eaf9053d24de69736b5260`、v2 `4948588`、v3 `70ebe45`、v4 `1035e69`、v5 `2710801`。对应历史证据与首轮 `.taste-skill/` 方向记录保留。技能位于工作区 `../.agents/skills/`；版本、来源、许可证和校验见 `../verification/site-next/skills-provenance.json`，未修改已有全局技能。

## 验证与字体更新

验证命令：`npm run check`、`npm test`、`npm run test:releases`、`npm run test:paths`、`npm run build`、`npm run verify:dist`。GitHub Pages 子路径验证使用 `SITE_BASE=/liss-works-next/` 和 `SITE_URL=https://heroliss.github.io`；本地默认根路径。

当前验收证据在 `../verification/site-next/v6/`，包含场景交互、截图来源、字体、构建与原版完整性材料；实际通过与限制以各报告为准。v5 的 22 个详情 × 4 个视口、共 88 组几何检查作为历史基准保留。原站 581 个 tracked 文件的 SHA256、字节数与 HEAD 继续按原始 baseline 独立核对。Taste 主观 house rules 的失败和其他检测提示均透明保留，不声称完整 Taste gate 或全部浏览器 FPS 通过；构建、几何、交互与视觉结论分别记录。

新增中文文案后，必须从 **`site-next/` 目录**运行：

```powershell
python scripts/prepare-media.py --fonts-only
```

这只更新新版字体子集与来源记录，不要从旧版目录运行同名脚本。

# Liss Works · v10 新版试验

新版使用 GSAP 官方技能，结合 Taste Skill v2、Frontend Design 与 Impeccable，保留 Astro + TypeScript 和深色模式。v10 的首屏以大主图和围绕其四角的四张较小后排图组织空间，共同换位；原生按钮承接键盘操作，内部三维画面的实际轮廓接收鼠标。原创曲线、色场与颗粒衬托真实作品，主题字带铺满页面宽度。SSFramework 与 DubForge 继续使用各自统一的 camera / world，22 项工程保留独立主题。源码位于 `site-next/`；旧版 `../site/` 的源码和 Git 历史保留，新版尚未替换或发布到原站。

## 预览与对照

- [新版](http://127.0.0.1:4322/)
- [旧版](http://127.0.0.1:4321/)
- [对照台](http://127.0.0.1:4320/)：切换页面、并排比例及桌面/手机视口。
- [视频机台直达](http://127.0.0.1:4322/#workflow-machine)：定位完整机台，传送带前景位于大图下方。

在 `site-next/` 执行 `npm ci`，然后 `npm run dev -- --port 4322`。旧版在 `../site/` 使用同样命令并指定 4321。对照台在 `../comparison/` 执行 `python -m http.server 4320 --bind 127.0.0.1`。工作区根目录 `启动新旧版对照.ps1` 可启动或复用这三个预览。

## v10 内容与交互

保留首页、工程库、22 项详情、关于页、交互实验、404 及原有资料、源码、下载、交流、筛选和算法功能；独立网页工具仍使用原实现。

- 首屏呈现 Outpost、DubForge、SSFramework、NomadWorkshop、Gomoku 五张真实作品卡片。桌面主图 620px、后排图 310px，以约 2:1 宽度、4:1 单图面积形成主次；四张后排图的中心靠近主图四个顶点，加入轻微错位。这个比例服务本页构图，不是普适审美定律。五张画面保留明显的默认透视，桌面精细指针统一追加约 ±9° / ±14° 的 X / Y 响应。窄屏将介绍移到舞台上方，手机缩放卡片并将后排中心向内收。下方五个可读名称标签、项目说明和“查看项目”分别组织。
- 点击结构为 `article > button > 3D visual span`：二维槽位由 GSAP Flip 同步移动并补间宽高，按钮外壳承接短弧线，内部画面接收鼠标并做透视反馈；原生按钮保留键盘与点击语义。标题栏与说明栏保留相同槽位，角色变化时保持内部结构稳定。外层透明留白不拦截后方可见卡片；画面中的装饰子层不接收指针事件。按下鼠标时同时暂停换位与画面响应，释放后恢复。
- 切换时五张卡片用 0.92 秒共同进入新槽位。起始保留旧遮挡顺序，所选后排图先向外略避让，原前图反向让出空间，在同一时间线的 0.48 秒处交换层级，再落入目标位置；到位或重置时清除临时层级和飞行位移。快速改选从当下可见位置接续，手机和粗指针设备同样平滑过渡静止角。ResizeObserver 只更新测量，文案改行不会强制结束内部缓动。离屏、页面隐藏和全局暂停控制换位播放，减少动态效果时直接到位；真实窗口尺寸变化或页面离开时终止旧换位并清除临时状态。
- 首页背景组件有页面、首屏、框架、游戏、探索与结尾六种原创变体。低对比色场与静态颗粒铺满视口宽度，线稿保持居中，最大宽度 1920px，左右各 12% 渐隐；SVG 保留原比例，深色底贯穿全页。首屏背景随指针反向轻移，并与卡片共用暂停和清理规则；背景没有自动循环。裁切限定在背景叶片和指针光的独立容器，作品场景保留溢出空间。
- 点击或用 Enter / Space 激活非当前卡片，只将它切到前景；激活已经位于前景的卡片，会进入对应详情。卡片获得焦点时保持位置并显示 outline；名称选择器支持悬停、聚焦与点击切换，“查看项目”也可直接进入当前工程。
- SSFramework 是黄绿的游戏框架连接背板：单个大图窗口配四个插槽，切换时以拔出、移动、接入线缆衔接架构图、运行诊断、工具中心与根节点绑定/生成弹窗。最后一幅使用真实 `16-binding-generated-script-links`，呈现绑定清单、生成目标、脚本链接和生成入口。截图完整保留、支持灯箱，每幅都有标题与 18px 说明。
- DubForge 是青蓝的紧凑视频工厂：同一窗口展示九个真实工作区，纵向 01–09 工序选择器对应传送带的九个站位。选择后，带编号的小车向目标站前进或返回，带纹和滚轮由同一行进位置驱动；这里表示正在浏览的工序，不表示实际任务进度。上屏评论与投稿明确标为按需选用。
- 两个场景各只有一个 camera 与一个 world，桌面相机基准均为 1450px。SS 的默认 X / Y / Z 角为 `7° / −12° / −1.7°`，Dub 为 `8° / 11° / −2°`；默认子层只通过 `translateZ` 分深度，指针只旋转整个 world。camera、world 与图像承载层允许画面溢出，真实截图位于机架、轨道与控制台前方；深色机台背景继续保留。SS 的标题与说明独立放在 world 外，保持平直。
- Dub 传送带是大图下方的独立前景，移动端用 SVG `<use>` 复用同一套站位与小车。窄屏先呈现大图，再将工序按钮置于左侧、说明控制台置于右侧，下方承接传送带。是否进入初始视口取决于窗口与布局，可通过 `#workflow-machine` 定位机台后查看。
- 三维画面与场景按精细指针回应，通栏轻斜横幅将外层空间移动与内层 `PLAY / BUILD / EXPERIMENT / REPEAT` 双分组连续循环分开；主题色场延伸到页面两侧，颜色通过 `--showcase-tone` 跟随当前选择的项目。暂停按钮按阅读边距保留在横幅右侧，横向视口边界由 html / body 处理，作品场景保留溢出空间。
- 五个重点详情及其余 17 页均有独立主题，完整 22 项主题表见 `DESIGN.md`。首页索引、工程库、继续探索卡片和详情颜色由 `src/data/project-worlds.ts` 统一。
- 详情真实图片配内容相关的外围 SVG 与约 7° / 9° 三维平面响应，不编造界面、数字或结果。同源页面在浏览器支持时使用原生 View Transition 衔接共享封面，普通导航与历史保持有效。
- 不在图片上添加探索、放大等文字提示或跟随指针的文字标签。全局暂停、离屏、页面隐藏及减少动态效果均会停止相应运动；偏好变化即时生效，页面离开清理资源。手机与无 JavaScript 状态保留自然阅读和有效入口。

SSFramework 架构图来自原仓库文档；运行诊断和工具图采自 Outpost 原生窗口，根节点绑定/生成弹窗来自明确标注的自制 UI 绑定示例，展示实际绑定清单和生成入口。DubForge 九张图为原程序真实生产界面中的隔离演示项目补拍，使用自写双语稿与自绘视频，保留原始截图字节；画面展示待制作状态，并不表示已经执行推理、配音、成片或投稿。来源与核验见 `../verification/site-next/v6/dubforge-nine-step-captures.json`。

样式由 `src/styles/project-worlds.css`、`project-worlds-tools.css`、`project-worlds-labs.css`、`framework-showcase.css`、`dubforge-workflow.css`、`factory-sequence.css`、`spatial-scenes.css`、`home-atmosphere.css` 及首页样式共同组织；原创背景由 `HomeAtmosphere.astro` 输出。动效由 `src/scripts/motion.ts` 接入各项目模块及 `showcase-narratives.ts`；封面连续性在 `site-continuity.ts`。场景切换、world 空间响应、小车与传送带统一遵守全局暂停、离屏、页面隐藏和减少动态效果；无 JavaScript 时提供自然图集与有效链接。暂停状态通过 `documentElement.dataset.motionPaused` 与 `portfolio:motion-state` 同步，并以受保护的 `sessionStorage` 在当前标签页内跨完整导航保留，BFCache 返回时先恢复选择再重建动效。

历史检查点：v1 `75a79327129c73e407eaf9053d24de69736b5260`、v2 `4948588`、v3 `70ebe45`、v4 `1035e69`、v5 `2710801`、v6 `4f53b48`、v7 `137c342`、v8 `8db1d9e4f27d7a66fce2d95d87f33f50b2da40fc`、v9 `26e9782875868de1268cb26752fef92e6e9490cf`。对应历史证据与首轮 `.taste-skill/` 方向记录保留，可回退对照。技能位于工作区 `../.agents/skills/`；版本、来源、许可证和校验见 `../verification/site-next/skills-provenance.json`，未修改已有全局技能。

## 验证与字体更新

验证命令：`npm run check`、`npm test`、`npm run test:releases`、`npm run test:paths`、`npm run build`、`npm run verify:dist`。GitHub Pages 子路径验证使用 `SITE_BASE=/liss-works-next/` 和 `SITE_URL=https://heroliss.github.io`；本地默认根路径。

当前验收证据在 `../verification/site-next/v10/`，最终结论以完成的命中采样、几何、交互、构建与原版完整性报告为准；本页的实现说明不代表本轮最终验收已完成。截图补拍与字体来源材料继续保留在 v6。v5 的 22 个详情 × 4 个视口、共 88 组几何检查作为历史基准保留。原站 581 个 tracked 文件的 SHA256、字节数与 HEAD 继续按原始 baseline 独立核对。Taste 主观 house rules 的失败和其他检测提示均透明保留，不声称完整 Taste gate 或全部浏览器 FPS 通过；构建、几何、交互与视觉结论分别记录。

新增中文文案后，必须从 **`site-next/` 目录**运行：

```powershell
python scripts/prepare-media.py --fonts-only
```

这只更新新版字体子集与来源记录，不要从旧版目录运行同名脚本。

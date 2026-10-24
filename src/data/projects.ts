import type { GalleryImage, Project, ProjectGroup } from './types';

export const groups: { id: ProjectGroup; label: string; description: string }[] = [
  { id: 'games', label: '游戏与工具', description: '可玩的世界，以及支撑它们的框架和编辑器。' },
  { id: 'ai-data', label: 'AI 与数据', description: '从视频译制、自动化到数据地图，让复杂流程变得可操作。' },
  { id: 'graphics', label: '图形与代码实验', description: '材质、算法与早期 Web 工程，记录代码带来的不同可能。' },
];

function image(repo: string, filename: string, width: number, height: number, caption: string, kind: string): GalleryImage {
  const base = `/media/${repo.toLowerCase()}/${filename.replace(/\.[^.]+$/, '')}`;
  const variants = [320, 640, 960].filter(size => size < width);
  return {
    src: `${base}.webp`,
    srcset: [...variants.map(size => `${base}-${size}.webp ${size}w`), `${base}.webp ${width}w`].join(', '),
    width,
    height,
    alt: caption,
    caption,
    kind,
  };
}

const nomad = [
  image('NomadWorkshop', '02-reference-vehicle-final-1080.png', 1920, 1080, '车辆甲板、三名居民与生活设施，资源状态常驻在 HUD 中。', '游戏实机'),
  image('NomadWorkshop', '04-build-and-world-1080.png', 1920, 1080, '建造面板与场景同屏，展示设施选择、网格和位置、角度吸附。', '建造交互'),
  image('NomadWorkshop', '05-resident-and-world-1080.png', 1920, 1080, '选中居民，查看需求、当前状态和行动进度。', '居民状态'),
  image('NomadWorkshop', '09-dialogue-corrected-1080.png', 1920, 1080, '居民活动中自然触发的世界空间对白。', '游戏实机'),
  image('NomadWorkshop', '12-facility-interaction-settings.png', 993, 993, '水箱设施的占地、交互组、物品区域和表现 Prefab 配置。', 'Unity Inspector'),
  image('NomadWorkshop', '11-deck-layout-definition.png', 993, 993, '甲板布局的网格、楼层高度、平台、楼梯与吸附参数。', 'Unity Inspector'),
];

const outpost = [
  image('Outpost', '15-title-stage-1080p.png', 1920, 1080, 'OUTPOST 标题舞台，进入游戏、查看设置与历史战绩。', '游戏实机'),
  image('Outpost', '17-about-720p.png', 1280, 720, '游戏内的工程说明，介绍模拟、对象池和界面流程。', '工程说明'),
  image('Outpost', '22-battle-seamless-floor-preview.png', 1920, 1080, '第 9 波战斗：机械炮台、装甲敌人、冲击环与交错弹流。', '游戏实机'),
  image('Outpost', '23-modern-battle-settings.png', 1920, 1080, '战场与设置同屏：音量、语言和 DOTS·ECS / OOP 后端入口。', '设置与效果'),
  image('Outpost', '26-English-settings-4x3.png', 1600, 1200, '英文设置页在 4:3 画面下的布局。', '语言与布局'),
  image('Outpost', '28-English-upgrades-4x3.png', 1600, 1200, '强化三选一：修复、装甲和装填速度，在战斗中调整成长方向。', '强化交互'),
  image('Outpost', '29-English-result-4x3.png', 1600, 1200, '撤离后的结算界面，记录波次、击杀、得分和历史战绩。', '游戏结算'),
];

const framework = [
  image('SSFramework', '03-live-services-command-trace.png', 1116, 889, '在 Outpost 运行时查看 Context 树、BattleState、事件订阅与 Command 流水。', '运行时诊断'),
  image('SSFramework', '04-project-configuration-assets.png', 1116, 889, '框架配置中心：模块、Profile 资产、UI 绑定与 Luban 配置入口。', '编辑器工具'),
  image('SSFramework', '05-module-tools-center.png', 1196, 889, '工具中心按用途聚合构建、代码生成、诊断与开发辅助工作台。', '编辑器工具'),
  image('SSFramework', '15-hierarchy-binding-compact.png', 856, 369, '自制示例：6 个绑定节点直接显示字段名，父节点汇总子孙绑定，根节点显示总数。', 'Hierarchy 节点绑定'),
  image('SSFramework', '13-node-component-popup.png', 300, 214, 'StartButton 节点的绑定弹窗：勾选 Button 组件，可修改字段名、追加其他组件或解绑。', '真实节点弹窗'),
  image('SSFramework', '16-binding-generated-script-links.png', 436, 496, '同一示例的绑定总览：字段、路径、组件类型、最终生成目标与两份已生成脚本。', '配置与生成结果'),
  image('SSFramework', '17-actual-generated-binding-source.png', 1196, 689, '只读查看实际生成的 .nodes.g.cs：6 个强类型字段与对应的 BindNodes() 路径绑定。', '真实生成代码'),
  image('SSFramework', '18-binding-directory-resolution.png', 1196, 889, 'UI 绑定工作台重新扫描后的实际结果：工程默认、目录覆盖与绑定 Prefab，按字段解析继承。', '配置继承'),
  image('SSFramework', '08-module-dependency-audit.png', 1196, 889, '依赖审计分开呈现模块、裁剪和热更新证据；图中如实提示当时的热更新尚未准备。', '模块依赖诊断'),
];

const eazy = [
  image('EazyBuildPipeline', '13-preprocessor-compact-self-made.png', 1216, 479, '按资源标签编排 iPhone / Android 贴图导入规则：尺寸、ASTC 格式与压缩质量。', '资源规则'),
  image('EazyBuildPipeline', '14-bundle-map-compact-self-made.png', 1216, 479, '从真实 AssetDatabase 读取三组 Bundle 标签与资产路径。', 'Bundle 清单'),
  image('EazyBuildPipeline', '04-reverse-dependencies-three-assets.png', 1216, 539, '反向依赖树：材质是依赖根，UsedChecker 被引用，UnusedPalette 无引用。', '反向依赖'),
  image('EazyBuildPipeline', '15-unused-assets-compact-self-made.png', 1216, 509, '按扫描范围与依赖根定位未使用的 UnusedPalette 贴图。', '资源检查'),
  image('EazyBuildPipeline', '18-script-defines-clear-empty-state.png', 1216, 509, '宏定义分组与启用、反转、排序控件；顶部明确显示没有应用资源标签。', '宏定义配置'),
  image('EazyBuildPipeline', '17-master-general-clear-empty-state.png', 1216, 689, '总控窗口组合流水线阶段，并管理资源版本、压缩方式与通用配置。', '流水线总控'),
  image('EazyBuildPipeline', '19-android-clear-empty-state.png', 1216, 939, 'Android 构建参数、ARM64、Gradle 与签名配置入口，签名信息留空。', '平台配置'),
  image('EazyBuildPipeline', '20-ios-clear-empty-state.png', 1216, 939, '保留历史配置的 iOS 参数、签名与导出入口；此处仅展示工具界面。', '平台配置'),
];

const dubforge = [
  image('dubforge', '05-editor-detail.jpg', 1440, 1000, '对照视频逐句编辑双语字幕、时间与声源；使用自建短片示例。', '示例项目'),
  image('dubforge', '06-project-overview.jpg', 1440, 1000, '项目总览将输入视频和各制作阶段放在同一工作区。', '示例项目'),
  image('dubforge', '07-assembly-versions.jpg', 1440, 1000, '分别配置原声双语版、中文配音版等成片版本。', '版本管理'),
  image('dubforge', '08-production-settings.jpg', 1440, 1000, '制作设置集中配置；默认与模板可复用，已有项目主动应用更新。', '制作设置'),
  image('dubforge', '09-project-space-large.jpg', 1440, 1000, '项目空间统一浏览视频、制作状态和项目入口。', '示例项目'),
];

const chart = [
  image('intelligence-index-cost-linear', '07-default-dark-live.png', 1280, 720, '默认深色主题：在线性任务成本轴上比较公开模型能力指数，结合图例与 Pareto 线观察取舍。', '默认深色主题'),
  image('intelligence-index-cost-linear', '08-provider-highlight-dark-live.png', 1280, 720, '点击 Anthropic 图例高亮对应模型，其余供应商淡化；深色视图保持点位与标签对应。', '供应商筛选'),
  image('intelligence-index-cost-linear', '09-clean-dots-dark-live.png', 1280, 720, '隐藏文字标签，保留 Anthropic 高亮与 Pareto 线，更清楚地观察点位分布。', '图表交互'),
];

const housing = [
  image('china-house-price-map', '04-dark-national.jpg', 1425, 1002, '暗色全国房价地图，分级设色、图例和城市数据侧栏相互配合。', '真实网页'),
  image('china-house-price-map', '06-dark-shenzhen-detail-after-fix.jpg', 1425, 1002, '放大深圳及周边，查看区县边界与选中地区详情。', '地图交互'),
  image('china-house-price-map', '07-dark-jingjinji.jpg', 1425, 1002, '京津冀区域的价格分布、地图标注与列表联动。', '暗色主题'),
  image('china-house-price-map', '08-light-jingjinji.jpg', 1425, 1002, '同一京津冀视角切换浅色主题。', '浅色主题'),
  image('china-house-price-map', '12-dark-shenzhen-ui720.jpg', 1265, 720, '低高度视口中保留地图、图例、控件与选中城市信息。', '响应式布局'),
];

const opengl = [
  image('LearnOpengl', 'cube-parallax.png', 1600, 900, '视差贴图木盒在天空盒环境中的实际 OpenGL 渲染。', 'GPU 实时渲染'),
  image('LearnOpengl', 'cube-flat-inspector.png', 1600, 900, '同视角关闭法线与高度贴图，观察基础材质表面。', '参数与效果'),
  image('LearnOpengl', 'cube-normal-inspector.png', 1600, 900, '开启法线贴图、关闭高度贴图，对照表面光照变化。', '参数与效果'),
  image('LearnOpengl', 'cube-inspector.png', 1600, 900, '法线、Parallax Occlusion 和自阴影开关与渲染画面同屏。', '参数与效果'),
  image('LearnOpengl', 'normals-inspector.png', 1600, 900, '绘制高密度球体的顶点法线，直接检查几何与法线方向。', '图形调试'),
  image('LearnOpengl', 'grayscale-inspector.png', 1600, 900, '场景经过灰度后处理，ImGui 调试面板保持独立彩色绘制。', '后处理'),
];

const ga = [
  image('GA-sort', '04-final-sort-convergence.jpg', 1265, 995, '固定 seed 42 演化交换序列，展示排序适应度曲线、输入与控制台结果。', '运行结果报告'),
  image('GA-sort', '05-final-equation-convergence.jpg', 1265, 1022, '演化计算 a + b × c 的函数序列，展示迭代曲线与算式结果。', '运行结果报告'),
  image('GA-sort', 'regression-checks-report.jpg', 3160, 1500, '原 Python 程序四项回归检查的实际输出，以阅读报告排版呈现。', '运行结果报告'),
];

const floyd = [
  image('FloydShortestPath', 'distance-matrix-report.jpg', 3160, 1500, '距离矩阵、A → B → C → D 的最短路径与不可达顶点 E。', '运行结果报告'),
  image('FloydShortestPath', 'regression-checks-report.jpg', 3160, 1500, '原 ConsoleDemo 的 11 项实际检查输出，以阅读报告排版呈现。', '运行结果报告'),
];

const blog = [
  image('liss-web', '01-home-dark-1280.png', 1280, 720, '线上首页的深色文章卡片、站点导航与写作入口。', '线上实拍'),
  image('liss-web', '02-markdown-writing-dark-1280.png', 1280, 720, '未提交的 Markdown 草稿与实时预览同屏，包含列表、代码块和发布入口。', '写作与预览'),
  image('liss-web', '03-article-dark-1280.png', 1280, 720, '线上文章的正文排版、作者信息与评论入口。', '文章阅读'),
  image('liss-web', '04-profile-dark-1280.png', 1280, 720, '站点作者 Liss 的主页，集中呈现简介、文章与关注入口。', '作者主页'),
  image('liss-web', '05-welcome-dark-1280.png', 1280, 720, '以访客身份加入，也可创建账号或登录，继续写作与交流。', '访客与账号'),
  image('liss-web', '06-article-dark-mobile-390.png', 390, 720, '390px 手机视口中的线上文章阅读与页面导航。', '移动端阅读'),
  image('liss-web', '07-discussion-dark-1280.png', 1280, 720, '文章下方的评论表单与已保存讨论。', '评论与讨论'),
];

const aoe = [
  image('AOE4-AutoVillager-Tool', 'editor-overview-safe-preview.jpg', 3160, 1500, '原节点编辑器与统一生产流程图的离线预览。', '离线编辑器预览'),
  image('AOE4-AutoVillager-Tool', 'editor-search-safe-preview.jpg', 3160, 1500, '在真实节点图中搜索“村民”，查看匹配节点和参数。', '离线编辑器预览'),
  image('AOE4-AutoVillager-Tool', 'editor-help-safe-preview.jpg', 3160, 1500, '帮助面板解释执行流、数据流、节点类型与编辑操作。', '离线编辑器预览'),
];

const routeLab = [
  image('route-lab', '01-archipelago-compare-1440.png', 1442, 1032, '三岛城市群的遗传算法与模拟退火对照：闭环路线、参数、实际耗时和收敛曲线同屏。', '实际算法运行'),
  image('route-lab', '02-random-compare-1440.png', 1442, 1032, '随机城市布局中的实际双算法运行，路线与收敛趋势随输入一同变化。', '输入与搜索过程'),
  image('route-lab', '03-ring-sa-1440.png', 1442, 1032, '环形城市使用模拟退火独立搜索，路线、降温参数与最佳解曲线同屏。', '退火参数与效果'),
];

const gomoku = [
  image('gomoku', '01-board-history-1280.png', 1282, 872, '木纹棋盘、真实棋子手数与主线棋谱同屏，本地双人和棋谱操作共用同一对局。', '实际对局与棋谱'),
  image('gomoku', '02-engine-hint-1280.png', 1282, 872, 'V3 威胁搜索与真实棋盘同屏：提示落点、搜索深度、节点、耗时和缓存命中可直接观察。', '实际对局与搜索'),
  image('gomoku', '03-engine-catalog-1280.png', 1282, 872, '展开真实引擎选择菜单，在 V3 威胁搜索与保留的经典搜索路径之间切换。', '引擎与参数'),
  image('gomoku', '04-replay-history-1280.png', 1282, 872, '逐手回看第 17 手时的棋盘与棋谱选中位置，历史状态和当前主线保持区分。', '棋谱回看'),
  image('gomoku', '11-live-network-v32-1280.png', 1282, 872, 'V3.2 通过 Photon Asia 进行真实双客户端联调：棋局、双方昵称与执棋身份，以及悔棋、重开请求入口同屏。', '真实双客户端联调'),
  image('gomoku', '06-independent-black-settings-1280.png', 1282, 872, '黑方设置页与棋盘同屏，独立选择黑方引擎、搜索深度、时间预算与评估函数。', '黑方独立设置'),
  image('gomoku', '07-independent-white-settings-1280.png', 1282, 872, '白方设置使用另一份参数，在保留黑方配置的同时选择自己的引擎、深度、预算与评估。', '白方独立设置'),
  image('gomoku', '08-ai-search-statistics-1280.png', 1282, 872, '按黑白展示实际 AI 落子次数、最近/平均/累计耗时、累计节点与缓存命中，统计只覆盖当前棋谱。', '双方思考统计'),
  image('gomoku', '09-network-lobby-1280.png', 1282, 872, '已连接 Photon Asia 大厅，列表显示一个可加入的 1/2 人房间，并提供创建与加入入口。', '大厅与房间列表'),
  image('gomoku', '10-network-waiting-1280.png', 1282, 872, '房间人数为 1/2 时等待对手，棋盘提示保留当前棋谱、双方就绪后开始联机对局。', '房间等待与棋谱保留'),
];

const sortLab = [
  image('sort-lab', '08-current-task-and-bars.png', 1386, 923, '顶部任务区与单规模柱图同屏，当前实验信息、参与算法与各项结果状态保持可见。', '当前任务与算法状态'),
  image('sort-lab', '09-stage-status-matrix.png', 1386, 923, '多档曲线配合“算法 × 阶段”状态矩阵，完成、跳过与未完成分别标注，不用零耗时填补缺失结果。', '算法与阶段状态矩阵'),
  image('sort-lab', '10-algorithm-guide.png', 1386, 923, '算法说明页展示核心原理、适合输入、复杂度与稳定性，并提供对应代码的编辑入口。', '随时查阅算法原理'),
  image('sort-lab', '11-core-code-editor.png', 1386, 923, '代码页聚焦 Sort 入口与所需助手，提供应用并比较、恢复内置和只读编译包装入口。', '聚焦核心代码'),
  image('sort-lab', '12-five-stage-results.png', 1386, 923, '五档规模按约 ×4 增长，双对数曲线与结果表同屏呈现实际耗时和逐项校验。', '五档几何增长比较'),
];

export const projects: Project[] = [
  {
    slug: 'nomadworkshop', repo: 'NomadWorkshop', name: 'NomadWorkshop', category: '移动生存游戏', group: 'games',
    summary: '用 AI 驱动开发的移动生存游戏，让居民、资源与设施一起运转。',
    intro: '我个人第一款以 AI 驱动开发、验证 vibe coding 能否支撑复杂游戏的项目。以废土移动小家为载体，把车辆、居民需求、资源搬运、设施交互和建造逐步接入同一个世界；游戏内的居民决策另由 Utility AI 驱动。',
    status: '开发中', tags: ['Unity 6', 'C#', 'Utility AI', 'URP'],
    features: [
      { title: '一个会运转的移动基地', body: '水、燃料、食物与设施状态参与日常循环；居民通过实际行走、取放和搬运完成工作。' },
      { title: '需求驱动的居民', body: '结合需求压力、工作价值、路径成本与个人倾向选择行动，面板可查看当前需求与行动进度。' },
      { title: '可配置的空间与建造', body: '甲板网格、设施占地和交互区域由配置定义，建造界面提供位置与角度吸附。' },
    ],
    usage: [
      { title: '打开正式场景', body: '克隆仓库并初始化子模块，用 Unity 6000.6.0f1 打开工程，再运行 ReferenceVehicleSample 场景。', code: 'git submodule update --init --recursive\n# Assets/Game/NomadWorkshop/Scenes/ReferenceVehicleSample.unity', language: 'powershell' },
      { title: '观察与建造', body: '在 HUD 选择居民查看状态，打开建造面板调整设施；空格暂停或继续，H 切换顶棚显示。' },
    ],
    note: '目前是开发中的基础切片，截图来自三居民场景，尚未代表完整生存流程或发行版本。',
    source: 'https://github.com/heroliss/NomadWorkshop', docs: 'https://github.com/heroliss/NomadWorkshop/blob/main/docs/ai-project-index.md',
    cover: nomad[0], gallery: nomad, related: ['ssframework', 'outpost'],
  },
  {
    slug: 'outpost', repo: 'Outpost', name: 'Outpost', category: '波次防守游戏', group: 'games',
    summary: '用一场炮台与敌群的波次防守，验证框架如何支撑完整游戏循环。',
    intro: 'SSFramework 的独立教程游戏与真实消费示例。纯 C# 战斗内核负责规则，Unity 场景负责表现，从标题、波次、强化到撤离结算形成可运行的循环，也把资源、配置、界面与测试接入放进同一工程。',
    status: 'Windows 版已发布', tags: ['Unity 6', 'C#', 'URP', 'SSFramework'],
    features: [
      { title: '波次与强化', body: '在逐渐密集的敌群中防守，通过修复、护甲和装填等强化改变战斗状态。' },
      { title: '分离模拟与表现', body: '战斗规则保留在不依赖 Unity 的纯 C# 模拟中，由场景、对象池、界面和特效表达结果。' },
      { title: '从入口到结算', body: '包含标题菜单、双语设置、战场 HUD、强化卡片、历史战绩与撤离结算。' },
    ],
    usage: [
      { title: '下载后直接运行', body: '下载 Windows x64 ZIP，完整解压后运行 Outpost.exe；资源已包含在包内，无需安装 Unity。' },
      { title: '体验一轮游戏', body: '从标题开始，观察波次与炮台战斗，在强化时选择卡片，或撤离查看结算；设置可切换语言和查看后端选项。' },
      { title: '查看与运行工程', body: '用 Unity 6000.6.0f1 打开源码，初始化子模块后运行 OutpostGame 场景。', code: 'git submodule update --init --recursive\n# Assets/Game/Outpost/Scenes/OutpostGame.unity', language: 'powershell' },
    ],
    note: '图片为 Unity Editor 实机；设置中的后端入口和诊断读数用于工程观察，不作为性能对比结论。',
    source: 'https://github.com/heroliss/Outpost', docs: 'https://github.com/heroliss/Outpost/tree/main/Assets/Game/Outpost/Documentation~',
    download: { repository: 'heroliss/Outpost', assetPattern: '^Outpost(?:-v?\\d+(?:\\.\\d+)*)?-(?:Windows|win)-x64\\.zip$' },
    cover: outpost[2], gallery: outpost, related: ['ssframework', 'nomadworkshop'],
  },
  {
    slug: 'gomoku', repo: 'gomoku', name: 'Liss Gomoku · 五子棋 V3.2', category: '五子棋与博弈搜索', group: 'games',
    summary: '11 种引擎、黑白独立设置与思考统计，让本地和在线对局都有清楚反馈。',
    intro: '基于找回的 v2.3 工程继续开发的 Windows 五子棋。双方独立配置搜索并查看实际落子的统计；V3.2 让连接、等待与对局状态更清楚，配合本地双人和逐手回看。',
    status: 'Windows 版已发布', tags: ['C#', '.NET 10', 'Alpha–Beta', 'Photon', 'WinForms'],
    features: [
      { title: '11 种引擎，双方各自配置', body: '经典搜索保留独立路径，另有 V3 威胁搜索；黑白可分别选择引擎、深度、时间预算和评估函数。' },
      { title: '思考成本随棋谱可读', body: '按黑白记录 AI 落子次数、最近/平均/累计耗时及累计节点、缓存命中；回看随手数更新，提示与取消不计入。' },
      { title: '明确的联机状态', body: 'Photon Asia 大厅自动接续连接与房间操作，显示人数、阶段与双方身份；悔棋和重开经双方请求、提交协商。' },
    ],
    usage: [
      { title: '解压后直接对弈', body: '完整解压 Windows x64 ZIP，运行 Liss.Gomoku.exe；自带 .NET 桌面运行时。新建对局选择执黑、执白、本地双人或引擎对弈。' },
      { title: '分别设置黑白', body: '打开引擎页，在“黑方设置”和“白方设置”子页分别选择算法、深度、预算与评估；提示可查看当前方的建议落点。' },
      { title: '查看统计与回放', body: '单独的统计页展示双方思考数据；回看棋谱时只统计当前手数以内的 AI 落子，Ctrl+S 可保存棋谱。' },
      { title: '邀请一位对手', body: '首次切到联机页自动连接，再创建或选择有空位的房间，无需先点连接。房主执黑，返回大厅会结束当前联机并保留棋谱。' },
    ],
    note: '截图来自本机实际运行。V3.2 延续 v2.3 源码，未声称恢复缺失的 v2.5 源码；单次搜索在一个后台线程展开，Photon 在线功能依赖网络、服务与账户配额。',
    source: 'https://github.com/heroliss/gomoku', docs: 'https://github.com/heroliss/gomoku#readme',
    download: { repository: 'heroliss/gomoku', assetPattern: '^liss-gomoku(?:-v?\\d+(?:\\.\\d+)*)?-(?:Windows|win)-x64\\.zip$' },
    cover: gomoku[7], gallery: gomoku, related: ['sort-lab', 'route-lab', 'outpost'],
  },
  {
    slug: 'dubforge', repo: 'dubforge', name: 'DubForge', category: '本地视频译制工作台', group: 'ai-data',
    summary: '把值得观看的视频译成中文，连接逐句精修、多版本成片与可恢复的交付。',
    intro: '面向本机制作的视频译制工作台。输入链接或本地视频，逐句校对原文、译文和时间，选择声音与字幕，再组合多个成片版本。制作计划、输入指纹与阶段回执，让修改后的局部更新和中断后的继续处理有据可查。',
    status: '源码发行', tags: ['Python', 'Vue', 'TypeScript', 'LLM', 'FFmpeg'],
    features: [
      { title: '逐句编辑与试听', body: '视频、句子列表和文字编辑围绕同一份校对稿组织，便于检查时间、译文与声源。' },
      { title: '多个成片版本', body: '同一项目可保留原声字幕版、中文配音版等不同目标，各自管理呈现与输出。' },
      { title: '稳定设置与局部更新', body: '默认与模板用于复用制作方案，已有项目主动应用新设置；输入变化按实际依赖确定哪些结果需要更新。' },
    ],
    usage: [
      { title: '安装主程序', body: '准备 Git、uv、Node.js 与 FFmpeg，在仓库根目录运行安装脚本；识别与音轨分离按需选择。', code: 'powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\install.ps1 -Asr -Separation', language: 'powershell' },
      { title: '打开本地工作台', body: '启动后访问 http://127.0.0.1:8600；LLM 与配音服务按教程连接，配音模型服务独立安装。', code: 'uv run --project backend --no-sync uvicorn app.main:app --host 127.0.0.1 --port 8600 --loop app.event_loop:create_event_loop', language: 'powershell' },
    ],
    note: '截图使用真实工作台与自建短片示例，展示编辑和配置用法；本组素材未执行实际模型译制或生成配音。',
    source: 'https://github.com/heroliss/dubforge', docs: 'https://github.com/heroliss/dubforge/tree/main/docs/tutorials',
    cover: dubforge[0], gallery: dubforge, related: ['intelligence-index-cost-linear', 'aoe4-autovillager-tool'],
  },
  {
    slug: 'ssframework', repo: 'SSFramework', name: 'SSFramework', category: 'Unity 模块化框架', group: 'games',
    summary: '多年 Unity 实践的集中整理，用清晰的分层与生命周期连接游戏和工具。',
    intro: '面向 Unity 项目的模块化运行时与编辑器基础设施。Context 管理依赖和作用域，Model / System / View 组织状态、规则与表现，Command、Event 和响应式状态连接数据流；资源、UI、配置与构建通过独立模块接入。',
    status: '持续维护', tags: ['Unity', 'C#', 'R3', 'UniTask', 'YooAsset'],
    features: [
      { title: '有边界的状态与行为', body: 'Context 组织作用域，View 发送 Command，System 修改 Model，通过响应式状态和事件反馈到界面。' },
      { title: '模块与适配器', body: '资源、UI、存储、配置和网络按需装配，第三方实现通过适配器连接，保留业务层边界。' },
      { title: '可观察的编辑器工具', body: '运行时诊断可查看 Context、订阅与命令轨迹，配置中心集中浏览模块和项目资产。' },
    ],
    usage: [
      { title: '接入 Unity 工程', body: '先按接入文档配置包源与必需依赖，再在 Package Manager 使用 Git URL 安装。', code: 'https://github.com/heroliss/SSFramework.git', language: 'text' },
      { title: '从真实消费项目开始', body: 'Outpost 展示小型游戏的场景、模拟和 UI 接入；NomadWorkshop 展示更复杂的居民、资源与设施系统。' },
    ],
    note: '诊断与工具图采自 Outpost。节点绑定使用本轮自制的独立 Prefab 示例；代码图为只读查看实际生成文件。计数与警告只表示采集时状态。',
    source: 'https://github.com/heroliss/SSFramework', docs: 'https://github.com/heroliss/SSFramework/blob/main/docs/framework-guide.md',
    cover: framework[0], gallery: framework, related: ['outpost', 'nomadworkshop', 'eazybuildpipeline'],
  },
  {
    slug: 'eazybuildpipeline', repo: 'EazyBuildPipeline', name: 'EazyBuildPipeline', category: 'Unity 资源与构建工具', group: 'games',
    summary: '第一份工作里的用心之作，把真实资源与构建需求整理为实用工具。',
    intro: '第一份工作期间，结合实际项目需求独立开发的 Unity 编辑器工具集。初入行时投入心血，把资源预处理、引用检查、Bundle、分包和 Player 构建整理为可组合模块；如今通用部分已完成 Unity 6 兼容整理。',
    status: 'Unity 6 兼容', tags: ['Unity Editor', 'C#', 'AssetBundle', 'IMGUI'],
    features: [
      { title: '标签驱动的资源规则', body: '按标签配置不同平台的导入尺寸、压缩格式与质量，统一管理贴图等资产的导入设置。' },
      { title: '依赖与 Bundle 检查', body: '读取真实 AssetDatabase Bundle 清单，查看反向依赖，并根据依赖根定位未使用资源。' },
      { title: '可组合的构建阶段', body: '总控串联资源处理和构建模块，集中管理宏、版本、通用设置及 Android / iOS 平台参数。' },
    ],
    usage: [
      { title: '创建独立宿主', body: '在仓库根目录执行准备脚本，用 Unity 6000.6.0f1 打开生成的宿主。', code: 'powershell -ExecutionPolicy Bypass -File tools/Prepare-ValidationHost.ps1 -Destination C:/Temp/EazyBuildPipelineHost', language: 'powershell' },
      { title: '查看工具窗口', body: '从 Window / EazyBuildPipeline 打开模块；为自己的资产设置 AssetBundle 名后，BundleManager 可显示对应真实清单。' },
    ],
    note: '窗口使用自制材质、贴图与示例配置。公司专用集成与完整发布流程需要原 SDK、签名和平台工具链。',
    source: 'https://github.com/heroliss/EazyBuildPipeline',
    cover: eazy[0], gallery: eazy, related: ['ssframework', 'outpost'],
  },
  {
    slug: 'intelligence-index-cost-linear', repo: 'intelligence-index-cost-linear', name: 'Intelligence × Cost', category: '模型能力与成本图表', group: 'ai-data',
    summary: '把 AI 的能力与费用画在一起，为购买和选择模型提供直观参照。',
    intro: '为了直观理解 AI 能力水平与使用费用的关系而制作的交互图表。以线性横轴呈现任务成本、纵轴呈现公开能力指数，结合供应商高亮、标签控制与独立轴缩放，帮助比较不同模型的取舍。',
    status: '在线可用', tags: ['JavaScript', 'SVG', 'GitHub Actions', '数据可视化'],
    features: [
      { title: '能力与成本同屏', body: '按供应商着色模型点位，结合任务成本、能力指数与 Pareto 线观察分布。' },
      { title: '按需聚焦', body: '悬浮查看模型，点击图例高亮供应商，隐藏标签或单独缩放横纵轴。' },
      { title: '静态站与自动更新', body: '网页读取仓库 JSON，GitHub Actions 定时获取公开页面数据并重新部署。' },
    ],
    usage: [
      { title: '直接浏览', body: '打开在线演示；滚轮缩放横轴，Shift + 滚轮缩放纵轴，拖动画布平移，Reset view 恢复。' },
      { title: '本地预览', body: '在仓库根目录启动静态服务，浏览器打开 http://localhost:8765。', code: 'python -m http.server 8765', language: 'shell' },
    ],
    note: '数据来自 Artificial Analysis 的公开页面快照；截图保留采集时的数据状态，最新日期与具体口径以在线页面为准。',
    source: 'https://github.com/heroliss/intelligence-index-cost-linear', demo: 'https://heroliss.github.io/intelligence-index-cost-linear/',
    cover: chart[0], gallery: chart, related: ['china-house-price-map', 'dubforge'],
  },
  {
    slug: 'china-house-price-map', repo: 'china-house-price-map', name: '全国房价交互地图', category: '渐进式数据地图', group: 'ai-data',
    summary: '把各地挂牌价格放进空间，从全国概览逐步探索到区县。',
    intro: '将住宅挂牌价格与行政边界结合的交互地图，用空间关系帮助理解区域差异。全国视角呈现城市价格，放大后按省加载区县细节；搜索、定位、列表和来源说明联动，保留明暗主题与图层透明度控制。',
    status: '在线可用', tags: ['JavaScript', 'SVG', '地图', '暗色主题'],
    features: [
      { title: '从全国逐级细化', body: '初始加载城市级边界，放大后显示区县；部分不设县级区划的城市继续细化至镇街。' },
      { title: '地图与数据联动', body: '通过搜索定位地区，地图选中与侧栏详情同步，标注按可见空间避让。' },
      { title: '适合不同视口的阅读', body: '明暗主题可切换并保留偏好，窄屏重排地图与列表，图层透明度支持连续调整。' },
    ],
    usage: [
      { title: '探索一个地区', body: '打开在线地图，搜索城市、点击列表或放大地图；选中后查看地区详情与价格口径。' },
      { title: '本地运行', body: '仓库根目录启动静态服务，再打开 http://127.0.0.1:8765。', code: 'python -m http.server 8765 --bind 127.0.0.1', language: 'shell' },
    ],
    note: '主要口径是住宅挂牌均价；缺少独立区县价格时沿用城市均价，补充估算使用 ※ 标记，详情保留来源说明。',
    source: 'https://github.com/heroliss/china-house-price-map', demo: 'https://heroliss.github.io/china-house-price-map/',
    cover: housing[0], gallery: housing, related: ['intelligence-index-cost-linear', 'liss-web'],
    video: { src: '/media/china-house-price-map/demo.mp4', poster: housing[0].src, caption: '真实网页交互片段：地图浏览、定位与显示调整，无声。' },
  },
  {
    slug: 'learnopengl', repo: 'LearnOpengl', name: 'LearnOpenGL', category: '实时图形实验', group: 'graphics',
    summary: '业余自学底层渲染的边学边做成果，让材质与光照的变化直接可见。',
    intro: '利用空余时间自学底层图形渲染时积累的 C++ OpenGL 实验。从窗口、几何与 Shader 逐步走向光照、阴影、法线、视差和后处理，通过 ImGui 将参数与实际效果放在同一画面中对照。',
    status: 'Windows 版已发布', tags: ['C++', 'OpenGL 4.5', 'GLSL', 'ImGui'],
    features: [
      { title: '材质效果对照', body: '用同一木盒和视角切换平面、法线、视差与自阴影，观察表面深度和光照变化。' },
      { title: '渲染与调试同屏', body: 'ImGui 参数面板直接控制实验；顶点法线、模型切换和相机操作辅助观察。' },
      { title: '后处理与真实帧导出', body: '在原渲染路径中应用灰度等效果，并支持固定预设的 GPU framebuffer 截图。' },
    ],
    usage: [
      { title: '直接运行 Windows 版', body: '下载完整 ZIP，全部解压后双击 LearnOpengl.exe。默认进入材质实验，资源和运行库已随包提供；显卡需支持 OpenGL 4.5。' },
      { title: '探索渲染实验', body: '在 ImGui 面板切换材质、光照与后处理；使用 WASD / QE 移动相机，Inspector 的返回按钮可打开原实验菜单。', code: './LearnOpengl.exe --preset cube --with-ui\n./LearnOpengl.exe --menu', language: 'powershell' },
      { title: '构建工程', body: 'Windows 准备现代 Visual Studio、Windows SDK 与 C++ 桌面工作负载，初始化子模块后运行构建脚本。', code: 'git submodule update --init --recursive\npowershell -ExecutionPolicy Bypass -File scripts/build.ps1', language: 'powershell' },
    ],
    note: '截图来自原程序实际 GPU 渲染；Windows 包已在本机 Windows 11 / NVIDIA OpenGL 4.5 验证默认场景、菜单及全部 15 个预设。',
    source: 'https://github.com/heroliss/LearnOpengl',
    download: { repository: 'heroliss/LearnOpengl', assetPattern: '^LearnOpenGL(?:-v?\\d+(?:\\.\\d+)*)?-(?:win|windows)-x64\\.zip$' },
    cover: opengl[0], gallery: opengl, related: ['outpost', 'ga-sort'],
  },
  {
    slug: 'aoe4-autovillager-tool', repo: 'AOE4-AutoVillager-Tool', name: 'AOE4 Flow Editor', category: '可视化自动化编辑器', group: 'ai-data',
    summary: '从和朋友打帝国时代四时的自动出农需求，迭代成节点式自动化工具。',
    intro: '为了和朋友玩《帝国时代 4》时减轻持续出农的操作压力而开发，经过多轮实际使用与优化。从固定辅助工具逐渐发展为节点式引擎，以执行流和数据流连接截图识别、资源判断与输入操作。',
    status: 'Windows 版已发布', tags: ['Python', 'LiteGraph.js', 'OpenCV', 'OCR'],
    features: [
      { title: '执行流与数据流', body: '白线决定动作顺序，彩线传递识别与计算结果；感知、逻辑、操作、游戏和控制节点可组合。' },
      { title: '在图里调试', body: '节点内编辑参数，搜索并定位节点，借助运行预览、耗时监控与断点查看过程。' },
      { title: '流程作为数据', body: '流程保存为 JSON，内置统一生产图演示共享判断、资源预算与多个生产段的编排。' },
    ],
    usage: [
      { title: '使用 Windows 发行版', body: '下载 EXE 打开编辑器；游戏内自动化需要按实际窗口配置识别区域与模板。' },
      { title: '打开内置节点图', body: '安装仓库依赖后，启动编辑器并载入统一生产流程。', code: 'pip install -r requirements.txt\npython run_editor.py flows/combined.flow.json', language: 'shell' },
      { title: '先观察执行计划', body: '无界面入口提供 dry-run，可先查看日志，再按实际窗口、分辨率和模板调整节点。', code: 'python run_headless.py --dry-run', language: 'shell' },
    ],
    note: '截图为原编辑器与流程的离线预览。实际运行需按游戏窗口配置识别区域与模板。',
    source: 'https://github.com/heroliss/AOE4-AutoVillager-Tool', docs: 'https://github.com/heroliss/AOE4-AutoVillager-Tool/tree/main/docs',
    download: { repository: 'heroliss/AOE4-AutoVillager-Tool', assetPattern: '^AOE4-FlowEditor(?:-v?\\d+(?:\\.\\d+)*)?\\.exe$' },
    cover: aoe[0], gallery: aoe, related: ['dubforge', 'ssframework'],
  },
  {
    slug: 'route-lab', repo: 'route-lab', name: 'Route Lab · 旅行商实验室', category: '组合优化实验工具', group: 'graphics',
    summary: '同一组城市，两种搜索方法，把路线、收敛与计算代价放在一起观察。',
    intro: '由 2016 年个人旅行商程序恢复并现代化的桌面实验工具。遗传算法与模拟退火在同一组城市上寻找更短闭环，画布编辑、固定种子和真实曲线连接起问题、参数与搜索结果。',
    status: 'Windows 版已发布', tags: ['C#', '.NET 10', '遗传算法', '模拟退火', 'WinForms'],
    features: [
      { title: '遗传与退火对照', body: '用实线、虚线区分实际路线，分别记录最佳长度、耗时和评估次数，不把迭代轮数误当同等预算。' },
      { title: '城市可以直接编辑', body: '生成三岛、环形或随机城市，点击添加、拖动移动、右键删除；更改城市后清除旧实验结果。' },
      { title: '过程可以重看', body: '固定参数与种子复现实验，真实进度快照驱动收敛曲线；停止保留已找到的最佳路线。' },
    ],
    usage: [
      { title: '下载并运行', body: '完整解压 Windows x64 ZIP，运行 RouteLab.exe；包内带运行时，无需安装 SDK。' },
      { title: '做一次同题对照', body: '生成城市或直接编辑画布，设置参数后点击“对照运行”；可随时停止，也可导出路线画布。' },
      { title: '复现实验场景', body: '从程序目录执行命令，生成固定三岛城市并实际运行两种算法。', code: '.\\RouteLab.exe --sample archipelago --seed 2026 --cities 48 --compare', language: 'powershell' },
    ],
    note: '截图来自实际算法运行；固定种子保留路线可复现性，耗时随运行环境变化。历史源码与本轮现代化实现分别保留。',
    source: 'https://github.com/heroliss/route-lab', docs: 'https://github.com/heroliss/route-lab#readme',
    download: { repository: 'heroliss/route-lab', assetPattern: '^RouteLab(?:-v?\\d+(?:\\.\\d+)*)?-(?:Windows|win)-x64\\.zip$' },
    cover: routeLab[0], gallery: routeLab, related: ['sort-lab', 'ga-sort', 'floydshortestpath'],
  },
  {
    slug: 'sort-lab', repo: 'sort-lab', name: 'Sort Lab · 排序实验台 V3.1', category: '算法比较与性能测量', group: 'graphics',
    summary: '看清任务状态，改写算法核心，比较每一档的真实结果。',
    intro: '八种排序与 Array.Sort 的可复现实验台，支持核心代码编译与独立进程执行。任务状态、约 ×4 的规模分档和算法阶段矩阵，让正确性、耗时、操作计数与分配可以一起对照。',
    status: 'Windows 版已发布', tags: ['C#', '.NET 10', 'Roslyn 5.9', '排序算法', 'WinForms'],
    features: [
      { title: '当前任务一眼可见', body: '顶部显示算法、规模与执行阶段；跳过按钮绑定明确目标，停止后保留已完成结果。' },
      { title: '代码与原理相邻', body: '九份核心模板可直接编辑并编译比较；算法说明随时可读，修改版注明内置性质仅供参考。' },
      { title: '每档结果保留状态', body: '单规模横柱、多档曲线配合状态矩阵；跳过与缺失不补零，计时与计数分开进行。' },
    ],
    usage: [
      { title: '解压后离线使用', body: '完整解压 Windows x64 ZIP，运行 Liss.SortLab.exe；运行时与编译依赖已包含，无需另装 SDK。' },
      { title: '选择规模与算法', body: '设置输入分布、最大规模、种子与算法，选择单规模或 3/5 档约 ×4 比较；慢任务可按明确目标跳过。' },
      { title: '查看原理或改写', body: '算法说明可直达代码；修改核心后按 Ctrl+Enter 应用并比较，编译错误可定位，失败保留生效版。' },
      { title: '固定种子重跑', body: '--stages 选择 1/3/5 档；benchmark 使用与 GUI 设置独立的固定场景导出 JSON。', code: '.\\Liss.SortLab.exe --size 4096 --stages 5 --showcase\n.\\Liss.SortLab.exe --benchmark --output result.json', language: 'powershell' },
    ],
    note: '一亿项为参数上限，目前实测百万项场景。修改版计数仅覆盖 SortContext API；独立进程具有当前用户权限，不是权限沙箱。',
    source: 'https://github.com/heroliss/sort-lab', docs: 'https://github.com/heroliss/sort-lab#readme',
    download: { repository: 'heroliss/sort-lab', assetPattern: '^Liss-SortLab(?:-v?\\d+(?:\\.\\d+)*)?-(?:Windows|win)-x64\\.zip$' },
    cover: sortLab[0], gallery: sortLab, related: ['route-lab', 'ga-sort', 'gomoku'],
  },
  {
    slug: 'ga-sort', repo: 'GA-sort', name: 'GA-sort', category: '遗传算法与程序演化', group: 'graphics',
    summary: '自行研究遗传算法的实验，让操作序列在选择、交叉与变异中演化。',
    intro: '研究遗传算法时独立实现的实验工程。把数组交换或变量运算编码成基因，用可替换的选择、交叉、变异和评估函数演化候选程序，分别尝试排序与 a + b × c 算式，并接入 DEAP 算子。',
    status: '可运行实验', tags: ['Python', '遗传算法', 'DEAP', '程序演化'],
    features: [
      { title: '演化交换序列', body: '把数组下标交换作为基因，用排对的位置数衡量适应度，观察种群逐代接近升序。' },
      { title: '演化计算过程', body: '基因也可表示变量读取、加法和乘法，使用多组输入评估候选函数序列。' },
      { title: '可复现的观察入口', body: '控制台接受固定随机种子，便于重看某次演化过程，再对照曲线与原始输出。' },
    ],
    usage: [
      { title: '准备 Python 环境', body: '建议 Python 3.14，安装仓库依赖；命令从仓库根目录执行。', code: 'python -m venv .venv\n.venv\\Scripts\\python -m pip install -r requirements.txt', language: 'powershell' },
      { title: '运行两个实验', body: '固定 seed 42 分别观察排序与算式演化。', code: '.venv\\Scripts\\python -m UI.main_test --seed 42\n.venv\\Scripts\\python -m UI.main_calculation --seed 42', language: 'powershell' },
    ],
    note: '原项目是控制台程序，图中曲线为实际运行输出的阅读报告；随机演化不保证每个种子都收敛。',
    source: 'https://github.com/heroliss/GA-sort',
    cover: ga[0], gallery: ga, related: ['floydshortestpath', 'learnopengl'],
  },
  {
    slug: 'floydshortestpath', repo: 'FloydShortestPath', name: 'FloydShortestPath', category: 'C# 全点对最短路', group: 'graphics',
    summary: '来自 Unity 工作项目的寻路需求，用预计算支持反复查询距离与路线。',
    intro: '为工作中 Unity 游戏项目的实际寻路需求，实现的经典 Floyd–Warshall 算法组件。预计算全点对距离和前驱表，供稳定图上的多次查询与路径还原使用；核心为普通 C#，附独立 .NET 示例。',
    status: '可复用组件', tags: ['C#', '.NET Standard 2.1', '图算法', 'Unity'],
    features: [
      { title: '距离与路径一起返回', body: '计算全点对距离，通过前驱表还原具体路线；不可达路径返回空数组。' },
      { title: '明确的输入约定', body: '使用正无穷表示无边，支持负权边并拒绝负环，保留输入矩阵不变。' },
      { title: '轻量集成', body: '核心文件不依赖 UnityEngine，复制到 Assets 即可使用，也能作为 .NET Standard 库调用。' },
    ],
    usage: [
      { title: '运行控制台示例', body: '准备 .NET 10 SDK，在仓库根目录运行示例，查看距离矩阵与多跳路径。', code: 'dotnet run --project examples/ConsoleDemo', language: 'shell' },
      { title: '计算一条路径', body: '邻接矩阵对角线为 0，无边为 float.PositiveInfinity；前驱表记录终点的前一个顶点。', code: 'float inf = float.PositiveInfinity;\nfloat[,] graph = { { 0, 3, 10 }, { inf, 0, 2 }, { inf, inf, 0 } };\nvar (predecessors, distances) = FloydShortestPath.Compute(graph);\nint[] route = FloydShortestPath.GetPath(predecessors, 0, 2); // 0, 1, 2\nfloat distance = distances[0, 2]; // 5', language: 'csharp' },
    ],
    note: '截图是原控制台输出的阅读报告；该组件负责图上路径计算，不包含完整的 Unity 导航系统。',
    source: 'https://github.com/heroliss/FloydShortestPath',
    cover: floyd[0], gallery: floyd, related: ['ga-sort', 'ssframework'],
  },
  {
    slug: 'liss-web', repo: 'liss-community', name: 'Liss Community · 记录与交流', category: 'Flask 写作与交流', group: 'graphics',
    summary: '自学 Flask 与前端 Web 技术的完整实践，把账户、文字和互动串起来。',
    intro: '自学 Flask 后端与前端 Web 技术时独立完成的社交博客，最初部署于 Heroku。如今升级为默认深色的写作与交流小站：保留完整的内容与关系模型，让访客可以直接加入，也能把现有身份升级为账号。',
    status: '在线可体验', tags: ['Python', 'Flask', 'SQLAlchemy', 'Bootstrap'],
    features: [
      { title: '写作与互动', body: 'Markdown 源文与预览同屏，文章支持评论，用户资料与关注关系连接内容。' },
      { title: '完整的博客后端', body: '账户、角色权限、数据库迁移、管理入口和 REST API 在同一 Flask 工程中实现。' },
      { title: '先写作，再设置账号', body: '访客可以发文、编辑、评论与关注；升级账号保留同一个身份与已有内容，支持跨浏览器登录，绑定并验证邮箱后可找回密码。' },
    ],
    usage: [
      { title: '在线阅读与写作', body: '打开站点即可阅读；点击“开始写作”建立访客身份，发布文章、参与讨论或关注作者。内容保存在站点中。' },
      { title: '保留自己的身份', body: '访客可直接设置用户名和密码，原有文章、评论与关注关系一起保留。邮箱可选，也能在账号设置中后补或更换；验证后可用于找回密码。' },
      { title: '自行部署', body: '仓库提供本地运行、持久数据库、备份恢复和 PythonAnywhere 部署说明，方便继续开发这个小站。' },
    ],
    note: '旧 Heroku 数据没有找回；当前站点从欢迎内容重新开始。访客身份依赖浏览器 Cookie，设置账号后可跨浏览器继续使用。',
    source: 'https://github.com/heroliss/liss-community', docs: 'https://github.com/heroliss/liss-community/blob/main/docs/public-demo.md', demo: 'https://liss.pythonanywhere.com/',
    cover: blog[0], gallery: blog, related: ['dubforge', 'china-house-price-map'],
  },
];

export function getProject(slug: string): Project | undefined {
  return projects.find(project => project.slug === slug);
}

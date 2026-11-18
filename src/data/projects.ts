import type { Project, ProjectGroup } from './types';
import { projectImage as image } from './project-image.ts';
import { restoredProjects } from './restored-projects.ts';
import { webProjects } from './web-projects.ts';
import { frameworkArchitecture } from './framework-showcase.ts';

export const groups: { id: ProjectGroup; label: string; short: string; tone: string; description: string }[] = [
  { id: 'games', label: '游戏与实时场景', short: '游戏', tone: '#fd8358', description: '可以直接上手的游戏、棋类对弈，以及实时渲染的海岛场景。' },
  { id: 'tools', label: '框架与效率工具', short: '工具', tone: '#c8ec60', description: 'Unity 框架与构建管线，以及日常在用的桌面和网页工具。' },
  { id: 'ai-data', label: 'AI 与数据', short: 'AI 与数据', tone: '#30aff8', description: '视频译制、中文处理、图像识别自动化与交互式数据图表。' },
  { id: 'graphics', label: '图形与算法实验', short: '图形与算法', tone: '#e27ee8', description: '渲染、排序、寻路与系统模拟，把算法过程变成看得见的实验。' },
];

const glassAtoll = [
  image('glass-atoll', '40-aerial-final.png', 1440, 900, '晴天下俯瞰白沙岛屿，浅海由近岸的透明蓝渐变至远处深蓝。', 'WebGL 实机'),
  image('glass-atoll', '58-final-desktop-v2.png', 1440, 900, '靠近椰树与白沙，透过清澈水面观察海底的光影。', '海岸近景'),
  image('glass-atoll', 'sunset-island-final.png', 1209, 1292, '日落时的岛屿剪影与海面倒影，时间和机位控制同屏。', '黄昏场景'),
  image('glass-atoll', 'flower-final.png', 1209, 1292, '夜空中绽放的烟花，海面保留微弱倒影与远处岛屿轮廓。', '夜间烟花'),
  image('glass-atoll', 'controls-desktop.png', 1280, 900, '日景中的光线、镜头与抗锯齿设置，场景和交互面板同屏。', '画面控制'),
];

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
  image('dubforge', 'v7-overview-monitor.png', 1024, 640, 'Studio v3 项目总览：左侧查看自动进度与九道制作工序，右侧实时对照原片监视器与文件清单。', 'Studio v3 总览'),
  image('dubforge', 'v7-dubbing-workbench.png', 1024, 914, '字幕与配音工作台：收起式审查栏、几何参考短片试听器与 6 句中英对照台词同屏联动，支持按句重配。', '字幕与配音'),
  image('dubforge', 'v6-08-assemble.jpg', 1440, 900, '多版本成片工作台：同一项目并存「原声双语版」与「中文配音版」，各自独立管理音量、字幕与剪辑。', '多版本成片'),
  image('dubforge', 'v7-09-delivery.png', 1024, 640, '统一发布与双轨交付中心：上方衔接全自动流程，下方一键进入 B 站与抖音专属工作台精调封面与文案。', '双轨发布中心'),
  image('dubforge', 'v7-cover-bilibili-moss.jpg', 1280, 800, '本机 8GB 显卡通过 MOSS-Image 直出的 B 站 16:10 横版封面实样，高对比双行大字一眼清晰。', 'B 站 AI 封面实样'),
  image('dubforge', 'v7-project-space.png', 1024, 640, '项目空间看板：集中浏览多条视频状态、套用系列模板、批量导入或一键排队运行。', '项目空间'),
  image('dubforge', '08-production-settings.jpg', 1440, 1000, '全局默认、系列模板与单项目覆盖三级设置：配好一套方案，后续同系列视频直接复用。', '模板与设置'),
  image('dubforge', 'v7-cover-douyin-landscape.png', 1280, 960, '抖音 4:3 信息流横版 AI 封面实样：本地半精度生图释放显存后再排版文字，兼顾质感与清晰度。', '抖音 4:3 横版封面'),
  image('dubforge', 'v7-cover-douyin-portrait.png', 960, 1280, '抖音 3:4 个人主页竖版 AI 封面实样：大字标题严格锁定在中心 9:16 安全带内，全屏划动左右绝不裁字。', '抖音 3:4 竖版封面'),
];

const panxu = [
  image('panxu', '01-checkup-plan.png', 1650, 1075, '一键体检后的总览方案：先给放心清理、建议你看看、仅供了解三组结论，并将结果同步到各工具页。', '演练环境'),
  image('panxu', '02-plan-scores.png', 1650, 1075, '展开清理方案：支持按建议清理度一键勾选、多种排序与实时关键词搜索，逐项写明用途与原因。', '清理方案'),
  image('panxu', '03-score-basis.png', 1650, 1075, '展开任意一项查看依据：处理方式、命中的规则、为什么自动勾选，以及可一键打开的具体位置。', '评分依据'),
  image('panxu', '04-cleanup-confirm.png', 1650, 1075, '执行前分开列出永久删除的可重建缓存和移入回收站的项目及各自大小。', '执行确认'),
  image('panxu', '05-cleanup-result.png', 1650, 1075, '清理完成后分开显示真正释放的空间和仍在回收站里的空间，剩余待看项继续保留。', '清理结果'),
  image('panxu', '06-space-treemap.png', 1650, 1075, '空间分析用文件夹树和占用图查看整块磁盘，已知位置自动标注用途与清理路径。', '空间分析'),
  image('panxu', '07-duplicate-files.png', 1650, 1075, '重复文件逐字节比对；可按最早、最新或路径最短自动保留一份，也可请 AI 判断哪份值得留。', '重复文件'),
  image('panxu', '08-startup-items.png', 1650, 1075, '开机启动项和任务管理器共用同一套开关，并结合程序信息与 AI 说明标注能否安全关闭。', '开机与服务'),
  image('panxu', '09-junk-rules.png', 1650, 1075, '垃圾清理按 63 项内置规则与 Chromium 结构识别分组，只清理公认可以重建的缓存和临时文件。', '垃圾清理'),
  image('panxu', '10-operation-history.png', 1650, 1075, '操作记录汇总释放空间、回收站空间与可撤销修改，支持按分类筛选、搜索和一键撤销。', '操作记录'),
];

const chart = [
  image('intelligence-index-cost-linear', 'v2-01-overview-pareto-dark.png', 1680, 1050, '综合智能总览：在线性美元横轴上直观呈现 133 款主流模型的真实价差、左上角甜点区与帕累托前沿线。', '综合智能与真实价差'),
  image('intelligence-index-cost-linear', 'v2-02-human-arena-scenario.png', 1680, 1050, '人类与审美频道：展开「⚡ 场景配方」选定审美设计与前端预设，实时重算专属于你的性价比榜单。', '真人盲测与场景配方'),
  image('intelligence-index-cost-linear', 'v2-03-compare-zoomed-radar.png', 1680, 1050, '剖析对比工作台：微距去底雷达放大细微差距，右侧同步拆解五段缓存与思考账单及多云平台比价。', '微距雷达与账单拆解'),
  image('intelligence-index-cost-linear', 'v2-04-subscription-router.png', 1680, 1050, '订阅回本测算：对照 $20 月卡与日常使用频次，绿标「已回本」与黄标「API 省」一眼算清买不买会员。', '月卡回本与按次算账'),
  image('intelligence-index-cost-linear', 'v2-05-frontier-hard-index.png', 1680, 1050, '前沿极限频道：剔除已被刷到 90% 以上的旧题集，只保留未饱和硬核测试拉开第一梯队真实差距。', '未饱和硬核极限'),
  image('intelligence-index-cost-linear', 'v2-06-compare-strip-track.png', 1680, 1050, '分轴微距跑道：把聊天人味、网页 UI 审美与专业交付的 1% 胜负差距水平对齐放大，附三平台原始盲测胜率。', '分轴微距跑道对决'),
  image('intelligence-index-cost-linear', 'v2-07-multimodal-media-arena.png', 1680, 1050, '多模态生成频道：同屏比较 253 款文生图、视频生成与语音配音引擎的真人盲测表现与单次生成花费。', '生图 · 视频 · 配音比价'),
  image('intelligence-index-cost-linear', 'v2-08-coding-agents-light.png', 1680, 1050, '浅色护眼主题下查看编程智能体：虚线串联同一家族从轻量到重度思考档位的实力提升与花费增幅。', '浅色主题与思考档位轨迹'),
];

const housing = [
  image('china-house-price-map', 'v2-01-national-eight-metrics.png', 1680, 1050, '全国 372 城总览：一键切换买房或租房视角，右侧同步片区房价水位、热门商圈与代表小区。', '全局看房总览'),
  image('china-house-price-map', 'v2-02-matchmaker-buy-wizard.png', 1680, 1050, '三步找房向导：选好上班地、通勤距离和预算，自动跨城筛出广佛莞等高匹配板块。', '三步智能找房'),
  image('china-house-price-map', 'v2-03-commute-radar-adaptive.png', 1680, 1050, '以深圳湾科技生态园为起点开启路网与通勤圈，自动列出周边更划算的低价街区。', '上班通勤圈'),
  image('china-house-price-map', 'v2-04-community-5d-advisor.png', 1680, 1050, '点开南山后海恒裕滨城小区：直观查看建筑年代、容积率、物业费与买租参考建议。', '小区体检与建议'),
  image('china-house-price-map', 'v2-05-rent-persona-four-layouts.png', 1680, 1050, '切换「租房安居」看上海及长三角：四档户型实时算月租，附押一付三与买同款月供对比。', '四户型租房视角'),
  image('china-house-price-map', 'v2-06-drawdown-timeline-pk.png', 1680, 1050, '查看近十年高点回撤幅度，并把 4 个备选片区放进对比篮同图 PK 一年走势。', '高低位与多区对比'),
  image('china-house-price-map', 'v2-07-watertight-gba-hk-macau.png', 1680, 1050, '大湾区跨城连看：东莞中山细化到镇街，香港 18 区与澳门 8 堂区统一按元/㎡ 对比。', '跨城与港澳细分'),
  image('china-house-price-map', 'v2-08-light-shijiazhuang-xiaoqu.png', 1680, 1050, '浅色护眼主题下浏览石家庄裕华区商圈与小区，二三四线城市同样能查到小区细节。', '浅色主题与多城覆盖'),
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
  image('liss-web', '13-concise-home-1440.jpg', 1425, 990, '三篇简短初始帖、图文摘要与写作入口组成线上首页。', '线上实拍'),
  image('liss-web', '02-markdown-writing-dark-1280.png', 1280, 720, '未提交的 Markdown 草稿与实时预览同屏，包含列表、代码块和发布入口。', '写作与预览'),
  image('liss-web', '14-welcome-article-1440.jpg', 1425, 990, '简短欢迎文章以插图、重点句与行动入口组织阅读。', '文章阅读'),
  image('liss-web', '15-owner-profile-1440.jpg', 1425, 990, '站点作者 Liss 的主页，集中呈现简介、三篇公开文章与关注入口。', '作者主页'),
  image('liss-web', '05-welcome-dark-1280.png', 1280, 720, '以访客身份加入，也可创建账号或登录，继续写作与交流。', '访客与账号'),
  image('liss-web', '16-community-mobile-390.jpg', 375, 1542, '390px 手机视口中的图文列表，文章、图片与互动入口依次排列。', '移动端阅读'),
  image('liss-web', '17-discussion-1440.jpg', 1425, 990, '作品交流文章下方的真实评论表单与空讨论邀请。', '评论与讨论'),
  image('liss-web', '18-admin-overview-1440.jpg', 1425, 990, '线上管理概览，汇总公开与隐藏内容、用户状态及最近操作。', '线上管理后台'),
  image('liss-web', '10-admin-settings-dark-1280.png', 1280, 1434, '站点名称、欢迎语、注册与访客发文规则集中配置；画面来自独立本地验证环境。', '网站设置'),
];

const aoe = [
  image('aoe4-flow', 'editor-overview-native.jpg', 1306, 813, 'Windows 程序中的帝国时代 4 统一生产流程，折叠分组与共享参数同屏。', '真实 Windows 程序'),
  image('aoe4-flow', 'editor-node-parameters-native.jpg', 1306, 813, '搜索并选中游戏窗口检测节点，同屏查看 SDR / HDR 坐标、颜色、标题条件与参数说明。', '节点参数与说明'),
  image('aoe4-flow', 'topbar-native.jpg', 443, 30, '紧凑悬浮工具条，将启动、村民、商人和渔船开关与设置入口放在手边。', '紧凑工具条'),
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
    slug: 'glass-atoll', repo: 'glass-atoll', name: '玻璃海 · Atoll', category: '实时海岛场景', group: 'games',
    summary: '走近一座可漫游的热带离岛，看浅海、天光、昼夜与烟花随视角流动。',
    intro: '一座由实时 WebGL 场景构成的热带离岛。白沙、椰树、天空与透明浅海围绕同一片光运转；访客可以调整视角与时间，向水面投石、放下漂浮叶片，在夜色里欣赏烟花。',
    status: '可在线体验', demo: '/play/glass-atoll/', tags: ['WebGL 2', 'JavaScript', 'Three.js', '实时渲染'],
    source: 'https://github.com/heroliss/glass-atoll', docs: 'https://github.com/heroliss/glass-atoll#readme',
    features: [
      { title: '看得见海底的浅海', body: '水面把透明、反射和波纹叠在一起，近岸可见海床与随光变化的焦散。' },
      { title: '同一座岛的不同光线', body: '切换昼夜与天气，调整机位和镜头，让天空、椰树与水面重新组合成画面。' },
      { title: '让海面与夜空回应', body: '投石和漂浮叶片带来近处的小互动；夜间烟花加入倒影、环境受光与分层音效。' },
    ],
    usage: [
      { title: '打开在线体验', body: '点击在线体验即可进入海岛，无需安装；首次加载会准备场景资源，声音在首次交互后开启。' },
      { title: '从不同机位看海岸', body: '近看沙滩和透光浅海，再把镜头抬高，观察白沙岛屿与海水颜色的整体构图。' },
      { title: '观察一天的光线', body: '从晴天切到日落或夜晚，留意天光、椰树剪影和海面反射如何一起变化。' },
      { title: '为静景加入动作', body: '投石、放叶、点燃烟花，看看水面、灯光和声音怎样回应。' },
    ],
    note: '截图来自项目实际 WebGL 运行画面。在线版可直接漫游、切换昼夜并体验水面与烟花互动；初次加载需要下载场景资源。',
    cover: glassAtoll[0], gallery: glassAtoll, related: ['learnopengl', 'outpost', 'nomadworkshop'],
  },
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
    slug: 'dubforge', repo: 'dubforge', name: 'DubForge · 本地视频译制与多平台发布工作台', category: '本地视频译制与发布工作台', group: 'ai-data',
    summary: '把喜欢的外语视频变成中文字幕和自然配音——既能一键全自动出片，也能逐句对照精修，本地生成横竖双封面并一次发往 B 站与抖音。',
    intro: '面向视频爱好者与创作者的本地译制工作台。贴入链接或拖进本地视频，自动完成人声与背景乐分离、上下文地道翻译与中文配音；平时追更可套用模板一键跑到底，遇到重点视频随时点进单站改词调音（改哪句只重做哪句），还能用 8GB 显卡在本地直出防裁切封面，核对无误后分别发布到 B 站和抖音。',
    status: '开源可用 · 本地运行', tags: ['AI', '视频译制', '双语配音', 'Python', 'Vue', 'FFmpeg'],
    features: [
      { title: '保留背景乐的双语与配音', body: '自动分离人声与原片音乐，结合整段语境翻译；对着画面改哪句只重配哪句，不用整片重来。' },
      { title: '全自动与手动精修随时切换', body: '日常系列视频套用模板一键跑通；同一项目可同时保留「原声双语字幕版」与「中文配音版」。' },
      { title: '8GB 本地画双封面 · B站抖音同发', body: '内置本地 MOSS-Image 直出 B 站 16:10 与抖音 4:3 + 3:4 安全带双封面，两平台草稿独立核对发布。' },
    ],
    usage: [
      { title: '① 一键装好本地主程序', body: '在 Windows 上准备好 Git、uv、Node.js 与 FFmpeg，在仓库根目录执行安装脚本即可配齐前后端、语音识别与音轨分离环境：', code: 'powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\install.ps1 -Asr -Separation', language: 'powershell' },
      { title: '② 打开工作台，拿 1 分钟短片试手', body: '启动服务后浏览器打开 http://127.0.0.1:8600，在「设置」里填好大模型 API Key，新建项目拖入一段 1 分钟短片点「运行项目」，几分钟即可跑通首条双语成片：', code: 'uv run --project backend --no-sync uvicorn app.main:app --host 127.0.0.1 --port 8600 --loop app.event_loop:create_event_loop', language: 'powershell' },
      { title: '③ 按需接入配音、AI 封面与发布', body: '需要中文配音或本地 AI 封面时，在「设置 → 模型与服务」指向本机 IndexTTS / GPT-SoVITS 或 MOSS-Image 目录即可联动；首次在发布工作台扫码保存 B 站或抖音登录态，后续即可一键生成双封面并核对投稿。' },
    ],
    note: '工作台界面采自官方隔离只读演示环境（使用自绘几何短片与自写双语稿）；三张封面实样由本机 8GB 显卡运行 MOSS-Image 真实生成，不含任何私人账号或线上连接。',
    source: 'https://github.com/heroliss/dubforge', docs: 'https://github.com/heroliss/dubforge/tree/main/docs/tutorials',
    cover: dubforge[0], gallery: dubforge, related: ['panxu', 'intelligence-index-cost-linear', 'aoe4-flow'],
  },
  {
    slug: 'panxu', repo: 'panxu', name: '盘序 · Windows 磁盘清理助手', category: 'Windows 磁盘清理助手', group: 'tools',
    summary: 'AI 辅助发现清理线索，讲清文件用途与处理影响，绿色免安装、可回退。',
    intro: '面向 Windows 10 / 11 的绿色免安装磁盘清理工具。63 项内置规则与 Chromium 结构识别先清理常见缓存，AI 再结合本机线索分析陌生目录、旧文件与软件残留。每一项都写明是什么、为什么建议清理、处理后会怎样，遇到疑问还可以继续「问 AI」。一键体检覆盖所选磁盘并同步到各工具页；个人文件只移入回收站，AI 建议绝不绕过保护边界。',
    status: 'Windows 绿色版', tags: ['Python', 'AI', 'pywebview', 'WebView2', 'Windows'],
    features: [
      { title: '63 项规则 + AI 补充线索', body: '内置规则与 Electron / WebView2 结构化缓存识别覆盖常见垃圾；陌生目录、旧文件与疑似残留再结合本机事实交由 AI 复核。' },
      { title: '把能不能删讲明白', body: '先给三组总览结论，展开即可查看用途、0–10 分建议清理度与勾选依据；支持全页面实时搜索、快速加入排除与「问 AI」。' },
      { title: '绿色免安装，边界清晰', body: '解压即用、不写卸载注册表，设置里可按需生成桌面或开始菜单快捷方式并检查新版本；个人文件从不自动勾选，只移到回收站。' },
    ],
    usage: [
      { title: '解压即用（绿色免安装）', body: '下载按钮自动获取最新正式版 Windows x64 压缩包，完整解压后双击 PanXu.exe 即可使用，无需安装。需要 Windows 10 / 11（64 位）和 WebView2 运行时；也可在「设置 → 启动与权限」中一键创建桌面或开始菜单快捷方式。' },
      { title: '先在演练环境里试', body: '用 --sandbox 启动会生成一台模拟的「用了几年的电脑」，所有删除、禁用和卸载都只发生在演练目录里，可以随时还原或重建。', code: 'PanXu.exe --sandbox', language: 'PowerShell' },
      { title: '从源码运行', body: '需要 Python 3.10 以上；--debug 打开 WebView 开发者工具。', code: 'python -m pip install -r requirements.txt\npython run.py --sandbox', language: 'PowerShell' },
    ],
    note: '截图来自真实的盘序界面，运行在演练环境（模拟电脑）中；AI 复核使用测试脚本作答，没有连接真实模型，也没有处理真实文件。',
    source: 'https://github.com/heroliss/panxu', docs: 'https://github.com/heroliss/panxu/tree/main/docs',
    download: { repository: 'heroliss/panxu', assetPattern: '^PanXu(?:-v?\\d+(?:\\.\\d+)*)?-(?:Windows|win)-x64\\.zip$' },
    cover: panxu[0], gallery: panxu, related: ['nex', 'dubforge', 'utility-lab'],
  },
  {
    slug: 'ssframework', repo: 'SSFramework', name: 'SSFramework', category: 'Unity 模块化框架', group: 'tools',
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
    cover: frameworkArchitecture, gallery: framework, related: ['outpost', 'nomadworkshop', 'eazybuildpipeline'],
  },
  {
    slug: 'eazybuildpipeline', repo: 'EazyBuildPipeline', name: 'EazyBuildPipeline', category: 'Unity 资源与构建工具', group: 'tools',
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
    cover: eazy[5], gallery: eazy, related: ['ssframework', 'outpost'],
  },
  {
    slug: 'intelligence-index-cost-linear', repo: 'intelligence-index-cost-linear', name: 'Intelligence × Cost · AI 选型与真实花费指南', category: 'AI 模型选型与花费指南', group: 'ai-data',
    summary: '大模型那么多，怎么挑好用又不花冤枉钱？按真实用途筛甜点模型，顺手算清 20 美元月卡值不值得买。',
    intro: '面向日常用户与开发者的 AI 选型参考工具。用等比例的美元横轴还原真实价差，串联综合能力、未饱和硬核极限、真人盲测审美、编程智能体、网络安全与生图/视频/配音六大频道；支持一键套用工作流场景配方、最多 8 款微距同台剖析，以及包月会员与按量付费回本测算。',
    status: '在线可用 · 每 2 小时自动同步', tags: ['AI', '选型工具', 'JavaScript', 'SVG', '数据可视化'],
    features: [
      { title: '按日常用途一键筛模型', body: '内置写代码、做前端审美、自然聊天、写报告等五维场景配方，沿着左上角甜点线直接挑出最好用划算的一款。' },
      { title: '最多 8 款微距同台细比', body: '微距雷达与分轴跑道把 1% 的毫厘胜负清晰拉开，同步拆解隐性思考账单与多家云服务商差价。' },
      { title: '算清包月会员与多模态花费', body: '对照使用次数标出买 $20 月卡划算还是按次充值更省；250+ 生图、视频与配音引擎同屏比单价。' },
    ],
    usage: [
      { title: '日常聊天、写稿与做设计怎么挑', body: '打开在线工具切到「人类与审美」，点开「⚡ 场景配方」选高人味或前端审美预设，优先挑左上角虚线上的模型。' },
      { title: '纠结买不买 $20 / $100 月卡', body: '切到顶部「订阅回本」视图，选好你常用的月度次数，看目标模型标的是绿标「已回本」还是黄标「API 省」。' },
      { title: '开发者本地运行（可选）', body: '普通用户直接点顶部「在线体验」即可；如需在本地预览或跑单元测试，可在站点目录运行：', code: 'python -m http.server 8765', language: 'shell' },
    ],
    note: '截图采自在线版真实运行画面；评测数据每 2 小时自动同步自 Artificial Analysis、LMArena 与 Design Arena 公开榜单，实时排名与价格以在线页面为准。',
    source: 'https://github.com/heroliss/intelligence-index-cost-linear', docs: 'https://github.com/heroliss/intelligence-index-cost-linear#readme', demo: 'https://heroliss.github.io/intelligence-index-cost-linear/',
    cover: chart[0], gallery: chart, related: ['china-house-price-map', 'dubforge'],
  },
  {
    slug: 'china-house-price-map', repo: 'china-house-price-map', name: '全国房价交互舆图 · 买房与租房找房地图', category: '买房与租房找房地图', group: 'ai-data',
    summary: '不知道买哪、租哪划算？按上班地点和手头预算，在一张图上筛片区、画通勤圈、看小区底细。',
    intro: '面向买房与租房用户的全国交互找房地图。支持一键切换买房/四户型租房视角，用 3 步向导按通勤和预算跨城筛片区，把通勤圆心钉在任意写字楼门口找周边低价街区，放大即可查看具体小区的楼龄、容积率与买租参考建议。',
    status: '在线可用 · 持续更新', tags: ['找房工具', '交互地图', 'JavaScript', 'SVG', '数据可视化'],
    features: [
      { title: '3 步向导跨城筛片区', body: '选好上班地、通勤距离和预算，自动在都市圈内推荐买得起、租得值的候选板块。' },
      { title: '任意公司门口画通勤圈', body: '搜写字楼或点地图设起点，随放大细看真实路网，挑出顺路又省钱的周边街道。' },
      { title: '买房租房同图看小区底细', body: '四档租房户型实时算月租与押一付三；点开小区直看楼龄、容积率与买租建议。' },
    ],
    usage: [
      { title: '上班族找通勤好房', body: '打开在线地图，开启顶部「通勤圈」与「底图」，搜公司或地铁站设起点，放大挑出周边划算街区。' },
      { title: '刚需与租客筛跨城平替', body: '点击右上角「帮我找房」，填入上班区域与总价（或月租）上限，一键筛出周边高匹配板块。' },
      { title: '开发者本地运行（可选）', body: '普通访客直接点顶部「在线体验」即可；如需在本地调试按需代理服务，可运行：', code: 'node scripts/serve-local.js 8788', language: 'shell' },
    ],
    note: '截图采自在线版真实运行画面；多源统计经同城配对校准对齐标尺，具体房源价格以实际楼层、朝向与成交为准。',
    source: 'https://github.com/heroliss/china-house-price-map', docs: 'https://github.com/heroliss/china-house-price-map#readme', demo: 'https://heroliss.github.io/china-house-price-map/',
    cover: housing[0], gallery: housing, related: ['intelligence-index-cost-linear', 'panxu', 'liss-web'],
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
    slug: 'aoe4-flow', repo: 'aoe4-flow', name: 'AoE4 Flow · 帝国时代 4 自动化助手', category: '图像识别与游戏自动化', group: 'ai-data',
    summary: '为帝国时代 4 减少重复操作，用节点连接图像识别、判断与按键。',
    intro: '和朋友玩《帝国时代 4》时，为减轻持续出农的操作压力而开发，经过多轮实际使用与优化。默认流程与识别素材围绕这款游戏准备，也可为商人、渔船等生产场景编排操作，或组合自定义图像识别与键鼠流程。',
    status: 'Windows 版已发布', tags: ['Python', 'LiteGraph.js', 'OpenCV', 'OCR'],
    features: [
      { title: '执行流与数据流', body: '白线决定动作顺序，彩线传递识别与计算结果；感知、逻辑、操作、游戏和控制节点可组合。' },
      { title: '在图里调试', body: '节点内编辑参数，搜索并定位节点，借助运行预览、耗时监控与断点查看过程。' },
      { title: '从游戏配置开始', body: '默认流程与识别素材面向帝国时代 4；JSON 保存节点和连接，自定义识别与键鼠节点可扩展其他流程。' },
    ],
    usage: [
      { title: '使用 Windows 发行版', body: '下载 Windows ZIP，完整解压后运行 AoE4-Flow.exe；按实际游戏窗口配置识别区域与模板。' },
      { title: '打开内置节点图', body: '安装仓库依赖后，启动编辑器并载入统一生产流程。', code: 'pip install -r requirements.txt\npython run_editor.py flows/combined.flow.json', language: 'shell' },
      { title: '先观察执行计划', body: '无界面入口提供 dry-run，可先查看日志，再按实际窗口、分辨率和模板调整节点。', code: 'python run_headless.py --dry-run', language: 'shell' },
    ],
    note: '截图来自 Windows 版实际界面，采集时未启动自动操作。使用前需按游戏窗口、分辨率与 HDR 设置校准识别区域和模板。',
    source: 'https://github.com/heroliss/aoe4-flow', docs: 'https://github.com/heroliss/aoe4-flow/tree/main/docs',
    download: { repository: 'heroliss/aoe4-flow', assetPattern: '^AoE4-Flow-v\\d+(?:\\.\\d+)*-Windows-x64\\.zip$' },
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
    slug: 'liss-web', repo: 'liss-community', name: 'Liss Community · 记录与交流', category: 'Flask 写作与交流', group: 'tools',
    summary: '自学 Flask 与前端 Web 技术的完整实践，把账户、文字和互动串起来。',
    intro: '自学 Flask 后端与前端 Web 技术时独立完成的社交博客，最初部署于 Heroku。如今以深色界面连接 Markdown 写作、可选邮箱、真实互动与管理后台，让身份与内容长期保留。',
    status: '在线可体验', tags: ['Flask', 'Jinja2', 'JavaScript', 'SQLAlchemy', 'EasyMDE'],
    features: [
      { title: '写作与互动', body: 'Markdown 源文与预览同屏，文章支持评论，用户资料与关注关系连接内容。' },
      { title: '内容与站点管理', body: '管理文章、评论与用户，调整站点介绍和写作规则；隐藏可恢复，变更经确认并留有操作记录。' },
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
  ...restoredProjects,
  ...webProjects,
];

export function getProject(slug: string): Project | undefined {
  return projects.find(project => project.slug === slug);
}

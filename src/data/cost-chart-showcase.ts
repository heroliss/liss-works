/**
 * Intelligence × Cost 四步上手演示：每个浮起面板均切自对应 1680 × 1050 真实在线版截图，
 * 静止时与原图逐像素重合；以普通用户挑选 AI 与算清开销的真实动线串联四步体验。
 */
export const COST_SHOT = { width: 1680, height: 1050 } as const;
export const COST_SWEEP_MS = 1900;

export type CostStepId = 'overview' | 'scenario' | 'compare' | 'sub';
export type CostTone = 'accent' | 'mint' | 'warm' | 'sky';
export type CostRect = [number, number, number, number];

export interface CostStep {
  id: CostStepId;
  label: string;
  shot: string;
  figure: string;
  figureNote: string;
  title: string;
  body: string;
}

export interface CostPoint {
  group: string;
  step: CostStepId;
  label: string;
  note: string;
  tone: CostTone;
  callout: { x: [number, number]; top?: number; bottom?: number };
}

export interface CostLayer {
  id: string;
  step: CostStepId;
  group: string;
  rect: CostRect;
  depth: number;
  delay: number;
  chip?: string;
}

export const costSteps: CostStep[] = [
  {
    id: 'overview',
    label: '看清真实价差',
    shot: 'v2-01-overview-pareto-dark',
    figure: '左上找甜点',
    figureNote: '线性美元横轴 · 400+ 模型与生成引擎',
    title: '还原等比例美元刻度，一眼看清谁便宜又能打',
    body: '越往上能力越强、越往左单次越省钱；沿着左上角帕累托虚线挑选，轻松避开高价低能的智商税。',
  },
  {
    id: 'scenario',
    label: '按用途挑模型',
    shot: 'v2-02-human-arena-scenario',
    figure: '6 大频道 + 配方',
    figureNote: '示例：人类与审美 · 审美设计与前端配方',
    title: '写代码、做网页审美还是自然聊天？一键切换专属榜单',
    body: '除了综合考分，还能切看「人类与审美」真人盲测，或打开「⚡ 场景配方」按你的日常用途实时重算排名。',
  },
  {
    id: 'compare',
    label: '同台细比长短',
    shot: 'v2-03-compare-zoomed-radar',
    figure: '最多 8 款同台',
    figureNote: '微距放大差距 · 5 段账单拆解 · 多云比价',
    title: '纠结几款旗舰？放大看清 1% 胜负与每一分钱去向',
    body: '自动剥离雷达图圆心空白区放大细微差距，右侧同步拆解思考字数开销与各家云平台的实测差价。',
  },
  {
    id: 'sub',
    label: '算清买不买月卡',
    shot: 'v2-04-subscription-router',
    figure: '$20 / $100 / $200',
    figureNote: '包月会员 vs 按次充值 · 轻重混用模拟',
    title: '填好每月大概用几次，直接看买会员划算还是按次省钱',
    body: '绿标代表用够次数买月卡更省，黄标代表按量充值更划算；还能测算日常轻量款搭配旗舰款的省钱比例。',
  },
];

export const costPoints: CostPoint[] = [
  {
    step: 'overview', group: 'ov-sweetspot', tone: 'mint',
    callout: { x: [560, 1140], top: 530 },
    label: '左上角甜点区与前沿线',
    note: '绿色区域代表好于全榜中位水平；白色虚线连起每个价位段最强的代表模型。',
  },
  {
    step: 'overview', group: 'ov-weight', tone: 'warm',
    callout: { x: [48, 630], top: 506 },
    label: '看重省钱还是看重封顶实力',
    note: '点选「纯成本 / 均衡 / 主力 / 旗舰」或设预算上限，立刻高亮最符合你手头预算的冠军。',
  },
  {
    step: 'overview', group: 'ov-tabs', tone: 'accent',
    callout: { x: [386, 970], top: 72 },
    label: '六大实用频道随手切',
    note: '涵盖综合智能、未饱和硬核极限、真人盲测审美、编程智能体、网络安全与生图视频配音。',
  },
  {
    step: 'overview', group: 'ov-guide', tone: 'sky',
    callout: { x: [1080, 1648], top: 68 },
    label: 'Ctrl+K 速查与实况降价提醒',
    note: '支持中文别名搜千问、豆包、可灵；右上角每 2 小时自动提示新模型上榜与 API 降价。',
  },
  {
    step: 'scenario', group: 'sc-tabs', tone: 'mint',
    callout: { x: [386, 970], top: 72 },
    label: '真人盲测：看聊天人味与设计美感',
    note: '融合匿名真人投票与网页 UI 盲测，解决「考卷高分但说话像机器人、做网页不好看」的痛点。',
  },
  {
    step: 'scenario', group: 'sc-popover', tone: 'warm',
    callout: { x: [322, 890], bottom: 252 },
    label: '五维场景配方一键套用',
    note: '内置研发、前端审美、投研办公、去套话聊天等预设，也可自由拖动五项滑杆定制专属榜单。',
  },
  {
    step: 'scenario', group: 'sc-frontier', tone: 'accent',
    callout: { x: [880, 1490], bottom: 452 },
    label: '前沿线随用途实时重排',
    note: '切换配方或工作负载（如长文档带缓存、重度思考）后，全图分数与单次花费即刻同步重算。',
  },
  {
    step: 'compare', group: 'cp-chips', tone: 'accent',
    callout: { x: [48, 650], top: 192 },
    label: '最多 8 款备选并排 PK',
    note: '在散点图框选或搜索添加候选模型，还能一键把同一组模型带去其他频道交叉检验。',
  },
  {
    step: 'compare', group: 'cp-radar', tone: 'sky',
    callout: { x: [180, 790], bottom: 226 },
    label: '微距雷达 · 跑道 · 胜负分差 Δ',
    note: '三种对比视角随时切换，把顶尖模型之间 0.5%–2% 的细微胜负差距清晰拉开。',
  },
  {
    step: 'compare', group: 'cp-anatomy', tone: 'warm',
    callout: { x: [1010, 1624], top: 738 },
    label: '五段账单拆解与多云比价',
    note: '看清输入、缓存与隐性思考各自烧了多少钱，并列出同款开源模型在哪家云平台调用最划算。',
  },
  {
    step: 'sub', group: 'sb-controls', tone: 'sky',
    callout: { x: [48, 670], top: 214 },
    label: '填入月费档位与日常频次',
    note: '支持 $20 / $100 / $200 月卡对比，点击「混合路由模拟」还能测算大小模型搭配省钱方案。',
  },
  {
    step: 'sub', group: 'sb-sub-win', tone: 'mint',
    callout: { x: [980, 1624], top: 574 },
    label: '绿标「已回本」：买月卡更省心',
    note: '昂贵旗舰单次 API 动辄数美元，用上几次就超过月卡价格，配额够用时直接订会员更划算。',
  },
  {
    step: 'sub', group: 'sb-api-win', tone: 'warm',
    callout: { x: [980, 1624], bottom: 806 },
    label: '黄标「API 省」：按次用不花冤枉钱',
    note: '高性价比甜点模型每月用十几次仅需几美元，按量付费比包月会员省下一大半。',
  },
];

const sweptX = (left: number, right: number) => Math.round(((left + right) / 2) / COST_SHOT.width * COST_SWEEP_MS);

export const costLayers: CostLayer[] = [
  { id: 'ov-sweetspot', step: 'overview', group: 'ov-sweetspot', rect: [84, 502, 540, 840], depth: 62, delay: sweptX(84, 540), chip: '左上角甜点区' },
  { id: 'ov-weight', step: 'overview', group: 'ov-weight', rect: [22, 440, 916, 488], depth: 46, delay: sweptX(22, 916) },
  { id: 'ov-tabs', step: 'overview', group: 'ov-tabs', rect: [386, 7, 989, 56], depth: 58, delay: sweptX(386, 989), chip: '6 大评测频道' },
  { id: 'ov-guide', step: 'overview', group: 'ov-guide', rect: [1138, 10, 1668, 52], depth: 64, delay: sweptX(1138, 1668), chip: '上手指南 · Ctrl+K' },

  { id: 'sc-tabs', step: 'scenario', group: 'sc-tabs', rect: [386, 7, 989, 56], depth: 54, delay: 0, chip: '真人盲测与审美' },
  { id: 'sc-popover', step: 'scenario', group: 'sc-popover', rect: [322, 266, 782, 772], depth: 94, delay: 140, chip: '⚡ 5 维场景配方' },
  { id: 'sc-frontier', step: 'scenario', group: 'sc-frontier', rect: [796, 468, 1636, 760], depth: 50, delay: 260, chip: '实时重算排名' },

  { id: 'cp-chips', step: 'compare', group: 'cp-chips', rect: [24, 118, 1656, 178], depth: 52, delay: 0, chip: '最多 8 款同台' },
  { id: 'cp-radar', step: 'compare', group: 'cp-radar', rect: [38, 240, 974, 786], depth: 84, delay: 140, chip: '微距去底雷达' },
  { id: 'cp-anatomy', step: 'compare', group: 'cp-anatomy', rect: [996, 184, 1652, 724], depth: 72, delay: 270, chip: '5 段账单与多云比价' },

  { id: 'sb-controls', step: 'sub', group: 'sb-controls', rect: [22, 124, 1658, 200], depth: 64, delay: 0, chip: '填月费与使用频次' },
  { id: 'sb-sub-win', step: 'sub', group: 'sb-sub-win', rect: [22, 248, 1658, 560], depth: 78, delay: 140, chip: '绿标 · 月卡已回本' },
  { id: 'sb-api-win', step: 'sub', group: 'sb-api-win', rect: [22, 820, 1658, 976], depth: 88, delay: 280, chip: '黄标 · 按次更省钱' },
];

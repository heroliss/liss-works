/**
 * Intelligence × Cost 四步上手演示：每个浮起面板均切自对应 1680 × 1050 真实在线版截图，
 * 静止时与原图逐像素重合；以普通用户科学缩小候选、核验短板与算清花费的真实动线串联四步体验。
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
    shot: 'v3-01-overview-pareto-dark',
    figure: '左上找甜点',
    figureNote: '线性美元横轴 · 400+ 模型与生成引擎',
    title: '还原等比例美元刻度，一眼看清谁便宜又能打',
    body: '越往上能力越强、越往左单次越省钱；沿着左上角帕累托虚线挑选，点击任意圆点还能直接看到隐藏风险胶囊与跨榜排名。',
  },
  {
    id: 'scenario',
    label: '3 步缩小候选',
    shot: 'v3-02-shortlist-multi-archetype',
    figure: '多流派对撞',
    figureNote: '9 类用途 · 实测证据 + 客观风险提示',
    title: '不盲信单一跑分，3 步同时看清三类取向与潜在坑',
    body: '按真实用途（区分编程智能体与纯 API）与月卡/API 方式实时筛选三类对照方案，直接亮明跨机构证据及缺盲测、高幻觉、月卡多不含等风险。',
  },
  {
    id: 'compare',
    label: '同台细比长短',
    shot: 'v3-03-compare-zoomed-radar',
    figure: '最多 8 款同台',
    figureNote: '微距雷达 · LiveBench 2.0 · 五段账单拆解',
    title: '纠结几款候选？放大看清 1% 胜负与每一分钱去向',
    body: '剥离雷达图圆心空白区放大毫厘差距，支持切换 LiveBench 2.0 防污染雷达，右侧同步拆解思考字数开销与各家云平台实测差价。',
  },
  {
    id: 'sub',
    label: '算清买不买月卡',
    shot: 'v3-04-subscription-router',
    figure: '$20 / $100 / $200',
    figureNote: '包月会员 vs 按次充值 · 轻重混用模拟',
    title: '填好每月大概用几次，直接看买会员划算还是按次省钱',
    body: '绿标代表用够次数买月卡更省，黄标代表按量充值更划算；还能测算日常轻量款搭配旗舰款的 80/20 混用省钱比例。',
  },
];

export const costPoints: CostPoint[] = [
  {
    step: 'overview', group: 'ov-sweetspot', tone: 'mint',
    callout: { x: [560, 1140], top: 410 },
    label: '左上角甜点区与前沿线',
    note: '绿色区域代表好于全榜中位水平；虚线连起每个价位段最强的代表模型，单击锁定直看跨榜与风险提示。',
  },
  {
    step: 'overview', group: 'ov-weight', tone: 'warm',
    callout: { x: [48, 660], top: 278 },
    label: '看重省钱还是看重封顶实力',
    note: '点选「纯成本 / 均衡 / 主力 / 旗舰」或设预算上限，立刻高亮最符合你手头预算的前沿冠军。',
  },
  {
    step: 'overview', group: 'ov-tabs', tone: 'accent',
    callout: { x: [316, 954], top: 72 },
    label: '7 大实用频道含独立「机构分榜」',
    note: '涵盖综合智能、前沿极限、真人盲测审美、编程智能体、网络安全、多模态三赛道与 6 机构原榜。',
  },
  {
    step: 'overview', group: 'ov-guide', tone: 'sky',
    callout: { x: [1050, 1656], top: 70 },
    label: '选型参考 · 读懂榜单 · Ctrl+K 速查',
    note: '顶栏一键进入「3 步缩小候选」与新手导览，支持全局速查与每 2 小时自动上新/降价提醒。',
  },
  {
    step: 'scenario', group: 'sc-steps', tone: 'accent',
    callout: { x: [414, 1020], top: 412 },
    label: '9 大真实用途与 3 类付费方式',
    note: '将「编程智能体（端到端实战）」与「纯代码 API」分开，默认贴合月卡/订阅习惯且选项中性无诱导。',
  },
  {
    step: 'scenario', group: 'sc-cards', tone: 'mint',
    callout: { x: [414, 1080], bottom: 602 },
    label: '三流派对撞 · 证据与风险全摊开',
    note: '并排呈现口碑稳健、API 效率与能力上限三类参照；绿标给实测依据，黄标直指缺盲测、高幻觉与月卡不含。',
  },
  {
    step: 'scenario', group: 'sc-foot', tone: 'warm',
    callout: { x: [480, 1200], bottom: 230 },
    label: '透明边界 · 一键核验分歧与对比',
    note: '诚实注明榜单并非绝对答案，并支持直接把 3 款候选送进剖析对比，或跳转争议分歧榜核验口碑落差。',
  },
  {
    step: 'compare', group: 'cp-chips', tone: 'accent',
    callout: { x: [48, 650], top: 196 },
    label: '最多 8 款备选并排 PK',
    note: '可从散点图框选、选型参考或搜索添加候选模型，还能一键把同一组模型同步带去其他频道交叉检验。',
  },
  {
    step: 'compare', group: 'cp-radar', tone: 'sky',
    callout: { x: [140, 790], bottom: 230 },
    label: '微距雷达 · LiveBench 2.0 · 胜负分差 Δ',
    note: '三种视角随时切换并支持 LiveBench 2.0 七维防污染雷达，把 0.5%–2% 的细微差距清晰拉开。',
  },
  {
    step: 'compare', group: 'cp-anatomy', tone: 'warm',
    callout: { x: [1006, 1640], top: 778 },
    label: '五段账单拆解与多云比价',
    note: '看清输入、缓存读写与隐性思考各自烧了多少钱，并列出同款开源模型在哪家云平台调用最划算。',
  },
  {
    step: 'sub', group: 'sb-controls', tone: 'sky',
    callout: { x: [48, 680], top: 310 },
    label: '填入月费档位与日常频次',
    note: '支持 $20 / $100 / $200 月卡对比，点开「混合路由模拟」可测算大小模型分流搭配省钱比例。',
  },
  {
    step: 'sub', group: 'sb-sub-win', tone: 'mint',
    callout: { x: [980, 1640], top: 662 },
    label: '绿标「已回本」：买月卡更省心',
    note: '高消耗旗舰单次 API 动辄数美元，用上几次就超过月卡价格，配额够用时直接订会员更划算。',
  },
  {
    step: 'sub', group: 'sb-api-win', tone: 'warm',
    callout: { x: [980, 1640], bottom: 416 },
    label: '黄标「未回本 · API 省」：按次更划算',
    note: '高性价比甜点模型每月用十几次仅需几美元，按量付费比包月会员省下一大半。',
  },
];

const sweptX = (left: number, right: number) => Math.round(((left + right) / 2) / COST_SHOT.width * COST_SWEEP_MS);

export const costLayers: CostLayer[] = [
  { id: 'ov-sweetspot', step: 'overview', group: 'ov-sweetspot', rect: [84, 272, 540, 620], depth: 62, delay: sweptX(84, 540), chip: '左上角甜点区' },
  { id: 'ov-weight', step: 'overview', group: 'ov-weight', rect: [22, 210, 960, 260], depth: 46, delay: sweptX(22, 960) },
  { id: 'ov-tabs', step: 'overview', group: 'ov-tabs', rect: [316, 8, 954, 56], depth: 58, delay: sweptX(316, 954), chip: '7 大频道 · 机构分榜' },
  { id: 'ov-guide', step: 'overview', group: 'ov-guide', rect: [1050, 8, 1668, 54], depth: 64, delay: sweptX(1050, 1668), chip: '选型参考 · 读懂榜单' },

  { id: 'sc-steps', step: 'scenario', group: 'sc-steps', rect: [414, 196, 1266, 398], depth: 56, delay: 0, chip: '9 类用途 · 月卡/API' },
  { id: 'sc-cards', step: 'scenario', group: 'sc-cards', rect: [414, 470, 1266, 826], depth: 92, delay: 140, chip: '三流派对撞 · 证据与风险' },
  { id: 'sc-foot', step: 'scenario', group: 'sc-foot', rect: [414, 838, 1266, 936], depth: 50, delay: 260, chip: '一键核验分歧与对比' },

  { id: 'cp-chips', step: 'compare', group: 'cp-chips', rect: [24, 122, 1656, 180], depth: 52, delay: 0, chip: '最多 8 款同台' },
  { id: 'cp-radar', step: 'compare', group: 'cp-radar', rect: [26, 190, 985, 830], depth: 84, delay: 140, chip: '微距雷达 · LiveBench 2.0' },
  { id: 'cp-anatomy', step: 'compare', group: 'cp-anatomy', rect: [998, 190, 1652, 762], depth: 72, delay: 270, chip: '5 段账单与多云比价' },

  { id: 'sb-controls', step: 'sub', group: 'sb-controls', rect: [24, 214, 1656, 296], depth: 64, delay: 0, chip: '填月费与使用频次' },
  { id: 'sb-sub-win', step: 'sub', group: 'sb-sub-win', rect: [24, 344, 1656, 646], depth: 78, delay: 140, chip: '绿标 · 月卡已回本' },
  { id: 'sb-api-win', step: 'sub', group: 'sb-api-win', rect: [24, 652, 1656, 976], depth: 88, delay: 280, chip: '黄标 · 按次更省钱' },
];

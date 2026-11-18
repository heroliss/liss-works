/**
 * 全国房价交互舆图四步上手演示：每个浮起面板均切自对应 1680 × 1050 真实截图，
 * 静止时与原图逐像素重合；以普通找房用户的真实动线串联四步体验。
 */
export const ATLAS_SHOT = { width: 1680, height: 1050 } as const;
export const ATLAS_SWEEP_MS = 1900;

export type AtlasStepId = 'overview' | 'match' | 'commute' | 'xiaoqu';
export type AtlasTone = 'accent' | 'rent' | 'warm' | 'sky';
export type AtlasRect = [number, number, number, number];

export interface AtlasStep {
  id: AtlasStepId;
  label: string;
  shot: string;
  figure: string;
  figureNote: string;
  title: string;
  body: string;
}

export interface AtlasPoint {
  group: string;
  step: AtlasStepId;
  label: string;
  note: string;
  tone: AtlasTone;
  callout: { x: [number, number]; top?: number; bottom?: number };
}

export interface AtlasLayer {
  id: string;
  step: AtlasStepId;
  group: string;
  rect: AtlasRect;
  depth: number;
  delay: number;
  chip?: string;
}

export const atlasSteps: AtlasStep[] = [
  {
    id: 'overview',
    label: '选买房或租房',
    shot: 'v2-01-national-eight-metrics',
    figure: '买房 / 租房',
    figureNote: '全国 372 城 · 3,200+ 区县镇街',
    title: '先切视角，一张图看清各地冷热',
    body: '顶部一键切换「买房」或「租房」，滚轮放大就能从城市一路细看到区县、街道商圈与具体小区。',
  },
  {
    id: 'match',
    label: '三步筛片区',
    shot: 'v2-02-matchmaker-buy-wizard',
    figure: '3 步初筛',
    figureNote: '示例：天河上班 · 30km · 320 万',
    title: '对城市不熟？填完通勤和预算直接推荐',
    body: '点右上角「帮我找房」，选好上班区域、能接受多远和手头预算，自动筛出跨区跨城候选板块。',
  },
  {
    id: 'commute',
    label: '画上班通勤圈',
    shot: 'v2-03-commute-radar-adaptive',
    figure: '2 / 5 / 10 km',
    figureNote: '示例：深圳湾科技生态园周边',
    title: '把圆心钉在公司门口，顺路找划算住处',
    body: '搜写字楼或点地图设起点，滚轮越放大圈越细，自动挑出同圈层更省钱的周边街道。',
  },
  {
    id: 'xiaoqu',
    label: '查小区看建议',
    shot: 'v2-04-community-5d-advisor',
    figure: '6 项底细',
    figureNote: '示例：深圳南山 · 恒裕滨城',
    title: '点开具体小区，居住条件与买租利弊一卡看清',
    body: '拉近街道点选小区，直观查看楼龄、容积率、物业费，以及适不适合买或租的参考建议。',
  },
];

export const atlasPoints: AtlasPoint[] = [
  {
    step: 'overview', group: 'ov-legend', tone: 'warm',
    callout: { x: [24, 620], bottom: 856 },
    label: '白话读图提示',
    note: '左下角自带通俗说明，不用懂房产术语也能看懂颜色深浅。',
  },
  {
    step: 'overview', group: 'ov-tabs', tone: 'accent',
    callout: { x: [24, 660], top: 132 },
    label: '8 种实用看房视角',
    note: '除了房价和月租，还能切看租金回报、收入负担与近十年跌幅。',
  },
  {
    step: 'overview', group: 'ov-intent', tone: 'rent',
    callout: { x: [1080, 1656], top: 84 },
    label: '买房 ↔ 租房一键切',
    note: '切换后全图价格与详情同步变化；右侧「帮我找房」随时唤起向导。',
  },
  {
    step: 'overview', group: 'ov-dossier', tone: 'accent',
    callout: { x: [620, 1176], top: 260 },
    label: '右侧片区速览',
    note: '点选任意地区，立刻列出价格水位、热门商圈与代表小区入口。',
  },
  {
    step: 'match', group: 'mm-form', tone: 'sky',
    callout: { x: [620, 1176], top: 120 },
    label: '只填三项日常条件',
    note: '选好上班地、通勤距离与买房总价（或月租），可按近通勤或省钱排序。',
  },
  {
    step: 'match', group: 'mm-results', tone: 'accent',
    callout: { x: [620, 1176], top: 560 },
    label: '跨城跨区不漏看',
    note: '自动把广佛、深莞、沪苏等顺路又便宜的邻近片区一并算进来。',
  },
  {
    step: 'match', group: 'mm-rings', tone: 'rent',
    callout: { x: [340, 860], top: 724 },
    label: '首付月供直接算好',
    note: '地图同步画出通勤圈，每张卡片直接标出预估首付、月供与推荐理由。',
  },
  {
    step: 'commute', group: 'cm-rings', tone: 'sky',
    callout: { x: [120, 680], bottom: 348 },
    label: '起点随手定',
    note: '搜公司名、点地图任意位置或拖动图钉设圆心，叠加真实道路对比方位。',
  },
  {
    step: 'commute', group: 'cm-popover', tone: 'accent',
    callout: { x: [560, 1155], top: 610 },
    label: '放大自动缩圈 · 挖低价街区',
    note: '远看跨城圈、拉近变步行圈，自动标出同距离里能省三五成的洼地。',
  },
  {
    step: 'commute', group: 'cm-crumb', tone: 'warm',
    callout: { x: [520, 1120], bottom: 868 },
    label: '随时逐级退回',
    note: '右下角记录「全国 › 省 › 市 › 区」当前位置，点一下即可退回上一级。',
  },
  {
    step: 'xiaoqu', group: 'xq-pins', tone: 'sky',
    callout: { x: [250, 820], top: 634 },
    label: '小区落到具体街口',
    note: '配合街道路网，离地铁口、主干道和商圈多远一眼看清。',
  },
  {
    step: 'xiaoqu', group: 'xq-spec', tone: 'accent',
    callout: { x: [640, 1205], top: 96 },
    label: '居住硬指标一卡看齐',
    note: '直观列出哪年竣工、容积率高低、绿化率、楼型与每月物业费。',
  },
  {
    step: 'xiaoqu', group: 'xq-advisor', tone: 'warm',
    callout: { x: [620, 1192], bottom: 690 },
    label: '直白买租建议与看房提醒',
    note: '对比同板块算贵还是划算、月租抵多少月供，并附实地看房核对清单。',
  },
];

const sweptX = (left: number, right: number) => Math.round(((left + right) / 2) / ATLAS_SHOT.width * ATLAS_SWEEP_MS);

export const atlasLayers: AtlasLayer[] = [
  { id: 'ov-legend', step: 'overview', group: 'ov-legend', rect: [16, 869, 609, 1034], depth: 46, delay: sweptX(16, 609) },
  { id: 'ov-tabs', step: 'overview', group: 'ov-tabs', rect: [16, 70, 729, 118], depth: 58, delay: sweptX(16, 729), chip: '8 种视角' },
  { id: 'ov-intent', step: 'overview', group: 'ov-intent', rect: [1194, 19, 1659, 70], depth: 64, delay: sweptX(1194, 1659), chip: '买房 ↔ 租房' },
  { id: 'ov-dossier', step: 'overview', group: 'ov-dossier', rect: [1191, 224, 1661, 820], depth: 42, delay: sweptX(1191, 1661) },

  { id: 'mm-form', step: 'match', group: 'mm-form', rect: [1191, 84, 1661, 530], depth: 62, delay: 0, chip: '3 步填条件' },
  { id: 'mm-results', step: 'match', group: 'mm-results', rect: [1191, 536, 1661, 882], depth: 92, delay: 140, chip: '跨城推荐 Top 6' },
  { id: 'mm-rings', step: 'match', group: 'mm-rings', rect: [354, 249, 815, 711], depth: 48, delay: 260, chip: '30km 通勤圈' },

  { id: 'cm-rings', step: 'commute', group: 'cm-rings', rect: [226, 361, 638, 784], depth: 74, delay: 0, chip: '随缩放变圈' },
  { id: 'cm-popover', step: 'commute', group: 'cm-popover', rect: [716, 71, 1155, 597], depth: 94, delay: 150, chip: '周边省钱洼地' },
  { id: 'cm-crumb', step: 'commute', group: 'cm-crumb', rect: [845, 882, 1155, 1034], depth: 42, delay: 280 },

  { id: 'xq-pins', step: 'xiaoqu', group: 'xq-pins', rect: [310, 260, 740, 620], depth: 56, delay: 0, chip: '街口位置' },
  { id: 'xq-spec', step: 'xiaoqu', group: 'xq-spec', rect: [1222, 48, 1631, 326], depth: 90, delay: 140, chip: '楼龄 · 容积率 · 物业' },
  { id: 'xq-advisor', step: 'xiaoqu', group: 'xq-advisor', rect: [1209, 656, 1644, 1042], depth: 68, delay: 280, chip: '买租参考建议' },
];

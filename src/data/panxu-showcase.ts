/**
 * The 盘序 home showcase: the real PanXu 2.5.0 window, taken apart. Every panel that rises out of the
 * window is cut from the very screenshot it sits in (a rectangle in the 1650 × 1075 export), so at
 * rest the window is exactly the capture. Every number comes from one real 一键体检 run of PanXu
 * 2.5.0 in its generated 演练环境 (verification/panxu-captures-20261118): the simulated C: drive is
 * 256 GB with 14.5 GB free; the plan holds 31 + 51 + 5 items (10.5 + 98.6 + 27.0 = 136.1 GB).
 */
export const PANXU_SHOT = { width: 1650, height: 1075 } as const;
/** How long the scan line takes from the top of the window to the bottom (CSS reads it as --sweep). */
export const PANXU_SWEEP_MS = 2000;

export type PanxuStepId = 'scan' | 'sort' | 'explain' | 'clean';
export type PanxuTone = 'accent' | 'safe' | 'review' | 'info';
/** [left, top, right, bottom] in screenshot pixels. */
export type PanxuRect = [number, number, number, number];

export interface PanxuStep {
  id: PanxuStepId;
  label: string;
  /** Screenshot (file stem in public/media/panxu) the window shows during this step. */
  shot: string;
  figure: string;
  figureNote: string;
  title: string;
  body: string;
}

export interface PanxuPoint {
  /** Links the explanation to the panels it describes. */
  group: string;
  step: PanxuStepId;
  label: string;
  note: string;
  tone: PanxuTone;
  /** Where the note floats over the window while its panels are pointed at, in screenshot pixels: a
   *  horizontal span, and the top edge (or the bottom edge, for a note above its panel). */
  callout: { x: [number, number]; top?: number; bottom?: number };
}

export interface PanxuLayer {
  id: string;
  step: PanxuStepId;
  group: string;
  rect: PanxuRect;
  /** How far the panel rises out of the window, in CSS pixels. */
  depth: number;
  /** When it rises, in ms after the window has changed. */
  delay: number;
  /** A short label pinned inside the panel's empty top-right corner. */
  chip?: string;
  /** A ring around part of the panel (in screenshot pixels), with its own label above. */
  marker?: { rect: PanxuRect; chip: string };
}

export const panxuSteps: PanxuStep[] = [
  { id: 'scan', label: '一键体检', shot: '01-checkup-plan', figure: '87 项', figureNote: '共 136.1 GB 待整理',
    title: '一次体检，同步到各工具页',
    body: '按范围检查垃圾缓存、多盘空间与大文件、个人文件、重复文件、开机启动及应用服务。63 项规则与结构化缓存识别先行，陌生的目录再交给 AI 复核。' },
  { id: 'sort', label: '分成三组', shot: '01-checkup-plan', figure: '10.5 GB', figureNote: '放心清理 · 其余 125.6 GB 由你决定',
    title: '能放心清的，已经替你勾好',
    body: '放心清理默认勾好；建议你看看和仅供了解只给依据和入口。你的个人文件从不自动勾选，删除也只是移到回收站。' },
  { id: 'explain', label: '讲清楚', shot: '03-score-basis', figure: '10 分', figureNote: 'Windows 更新下载缓存 · 990 MB',
    title: '每一项都写明依据',
    body: '展开任意一项：处理方式、命中的规则或 AI 分析、为什么自动勾选或保留，以及具体目录位置，都能直接查看。' },
  { id: 'clean', label: '清理并记下', shot: '05-cleanup-result', figure: '+9.7 GB', figureNote: '可用 14.5 → 24.3 GB · 760 MB 在回收站',
    title: '释放多少，说得清楚',
    body: '可重建的缓存直接删除，其余移到回收站；结果分开显示真正释放的空间与仍在回收站里的空间，每次修改都记进操作记录。' },
];

export const panxuPoints: PanxuPoint[] = [
  { step: 'scan', group: 'scan-free', callout: { x: [980, 1590], top: 342 }, label: '系统盘空间',
    note: '演练系统盘共 256 GB，只剩 14.5 GB，自动标出「空间紧张」。', tone: 'accent' },
  { step: 'scan', group: 'scan-rail', callout: { x: [276, 840], top: 205 }, label: '同步各工具页', tone: 'accent',
    note: '垃圾 9.7 GB、我的文件 15.1 GB、重复文件 11.5 MB、应用与启动项一次就位，勾选共用同一份。' },
  { step: 'scan', group: 'scan-plan', callout: { x: [940, 1590], bottom: 716 }, label: '87 项清理方案', tone: 'accent',
    note: '先给三组总览结论，展开即可按分数筛选、实时搜索或逐项查看原因。' },
  { step: 'scan', group: 'scan-coverage', callout: { x: [560, 1220], bottom: 888 }, label: '本次检查了什么', tone: 'accent',
    note: '写明 63 条缓存规则、C:/D: 双盘扫描、大文件复用与个人文件范围，跳过项也如实说明。' },
  { step: 'sort', group: 'sort-safe', callout: { x: [311, 820], bottom: 552 }, label: '放心清理',
    note: '31 项、10.5 GB，达到默认 ≥ 7 分门槛，已经替你勾好。', tone: 'safe' },
  { step: 'sort', group: 'sort-review', callout: { x: [700, 1220], bottom: 552 }, label: '建议你看看',
    note: '51 项、98.6 GB，写明用途与依据，不自动勾选，由你决定。', tone: 'review' },
  { step: 'sort', group: 'sort-info', callout: { x: [1080, 1605], bottom: 552 }, label: '仅供了解',
    note: '5 项、27.0 GB：休眠文件、Docker 与系统目录，只讲清楚并给出处理入口。', tone: 'info' },
  { step: 'sort', group: 'sort-action', callout: { x: [960, 1595], bottom: 968 }, label: '执行栏',
    note: '底部汇总当前已选 10.5 GB（31 项），点击后还会再确认一次删除与回收站明细。', tone: 'safe' },
  { step: 'explain', group: 'explain-row', callout: { x: [880, 1590], top: 228 }, label: '这一项',
    note: 'Windows 更新下载缓存，990 MB，由内置规则识别，建议清理度 10 分。', tone: 'accent' },
  { step: 'explain', group: 'explain-basis', callout: { x: [390, 980], top: 424 }, label: '评分依据', tone: 'safe',
    note: '标明永久删除、不经过回收站；符合保留期限的可重建缓存，10 分达到 ≥ 7 分门槛，自动勾选。' },
  { step: 'explain', group: 'explain-where', callout: { x: [980, 1574], top: 512 }, label: '清理这些位置',
    note: 'C:\\Windows\\SoftwareDistribution\\Download，一键复制路径或在资源管理器中打开。', tone: 'accent' },
  { step: 'clean', group: 'clean-free', callout: { x: [680, 1340], top: 342 }, label: '可用空间变化', tone: 'safe',
    note: '系统盘可用空间从 14.5 GB 增至 24.3 GB，只把真正腾出来的 +9.7 GB 算进可用空间。' },
  { step: 'clean', group: 'clean-done', callout: { x: [880, 1595], bottom: 508 }, label: '清理结果',
    note: '处理了 31 项：9.7 GB 缓存直接释放；1 项 760 MB 移入回收站，需要时可随时还原。', tone: 'safe' },
  { step: 'clean', group: 'clean-left', callout: { x: [311, 960], bottom: 734 }, label: '剩下的交给你',
    note: '还有 51 项建议你看看（98.6 GB）仍由你决定；仅供了解的 5 项保留说明与入口。', tone: 'review' },
];

const swept = (top: number, bottom: number) => Math.round((top + bottom) / 2 / PANXU_SHOT.height * PANXU_SWEEP_MS);
// 「本次检查了什么」: the three top coverage cards visible above the sticky action bar.
const coverageCols: Array<[number, number]> = [[311, 734], [747, 1170], [1182, 1605]];

export const panxuLayers: PanxuLayer[] = [
  { id: 'scan-free', step: 'scan', group: 'scan-free', rect: [305, 156, 1608, 330], depth: 44, delay: swept(156, 330) },
  { id: 'scan-rail', step: 'scan', group: 'scan-rail', rect: [10, 156, 250, 488], depth: 52, delay: swept(156, 488), chip: '同步各页' },
  { id: 'scan-plan', step: 'scan', group: 'scan-plan', rect: [311, 729, 1605, 793], depth: 32, delay: swept(729, 793) },
  ...coverageCols.map(([left, right], index): PanxuLayer => ({
    id: `scan-cov-${index + 1}`, step: 'scan', group: 'scan-coverage', rect: [left, 901, right, 980], depth: 28, delay: swept(901, 980),
  })),
  { id: 'sort-safe', step: 'sort', group: 'sort-safe', rect: [311, 567, 733, 706], depth: 96, delay: 0, chip: '默认勾好' },
  { id: 'sort-review', step: 'sort', group: 'sort-review', rect: [748, 567, 1169, 706], depth: 62, delay: 110, chip: '由你决定' },
  { id: 'sort-info', step: 'sort', group: 'sort-info', rect: [1184, 567, 1605, 706], depth: 34, delay: 220, chip: '只讲清楚' },
  { id: 'sort-action', step: 'sort', group: 'sort-action', rect: [311, 985, 1605, 1055], depth: 46, delay: 320,
    marker: { rect: [1420, 999, 1589, 1041], chip: '默认只执行这 31 项' } },
  { id: 'explain-row', step: 'explain', group: 'explain-row', rect: [313, 140, 1604, 219], depth: 40, delay: 0 },
  { id: 'explain-basis', step: 'explain', group: 'explain-basis', rect: [390, 234, 1574, 412], depth: 88, delay: 160, chip: '为什么是 10 分' },
  { id: 'explain-where', step: 'explain', group: 'explain-where', rect: [390, 422, 1574, 500], depth: 58, delay: 300 },
  { id: 'clean-free', step: 'clean', group: 'clean-free', rect: [305, 156, 1608, 330], depth: 72, delay: 0,
    marker: { rect: [480, 187, 572, 234], chip: '+9.7 GB 真腾出' } },
  { id: 'clean-done', step: 'clean', group: 'clean-done', rect: [311, 523, 1605, 724], depth: 54, delay: 180, chip: '释放与回收站分开' },
  { id: 'clean-left', step: 'clean', group: 'clean-left', rect: [311, 747, 1172, 932], depth: 26, delay: 320 },
];

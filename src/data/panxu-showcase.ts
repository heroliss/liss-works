/**
 * The 盘序 home showcase: the real PanXu window, taken apart. Every panel that rises out of the
 * window is cut from the very screenshot it sits in (a rectangle in the 1650 × 1075 export), so at
 * rest the window is exactly the capture. Every number comes from one real 一键体检 run of PanXu
 * 1.1.0 in its generated 演练环境 (verification/panxu-captures-20261105): the simulated C: drive is
 * 256 GB with 19.7 GB free; the plan holds 22 + 40 + 5 items.
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
  { id: 'scan', label: '一键体检', shot: '01-checkup-plan', figure: '67 项', figureNote: '共 65.9 GB 待整理',
    title: '先把占空间的东西找出来',
    body: '依次检查垃圾、系统盘空间、我的文件和重复文件。内置规则先认出常见情况，规则不认识的再交给 AI 复核。' },
  { id: 'sort', label: '分成三组', shot: '01-checkup-plan', figure: '10.8 GB', figureNote: '放心清理 · 其余 55.1 GB 由你决定',
    title: '能放心清的，已经替你勾好',
    body: '放心清理默认勾好；建议你看看和仅供了解只给依据和入口。你的个人文件从不自动勾选，只会移到回收站。' },
  { id: 'explain', label: '讲清楚', shot: '03-score-basis', figure: '10 分', figureNote: 'Windows 更新下载缓存 · 990 MB',
    title: '每一项都写明依据',
    body: '展开任意一项：它是什么、为什么列出、清理后会怎样，以及 0–10 分的建议清理度和勾选理由。' },
  { id: 'clean', label: '清理并记下', shot: '05-cleanup-result', figure: '+10.1 GB', figureNote: '可用 19.7 → 29.8 GB · 760 MB 在回收站',
    title: '释放多少，说得清楚',
    body: '缓存直接删除，其余移到回收站；结果分开显示释放的空间和回收站里的空间，每次修改都记进操作记录。' },
];

export const panxuPoints: PanxuPoint[] = [
  { step: 'scan', group: 'scan-free', callout: { x: [1060, 1580], top: 96 }, label: '可用空间', note: '演练系统盘共 256 GB，只剩 19.7 GB。', tone: 'accent' },
  { step: 'scan', group: 'scan-chart', callout: { x: [640, 1180], top: 812 }, label: '空间都在哪里', tone: 'accent',
    note: '按类别列出：应用数据 14.1 GB、垃圾文件 13.8 GB、很久没动过的大文件 9.4 GB……点一行就跳到对应的项目。' },
  { step: 'sort', group: 'sort-safe', callout: { x: [309, 735], top: 618 }, label: '放心清理', note: '22 项、10.8 GB，默认全部勾好。', tone: 'safe' },
  { step: 'sort', group: 'sort-review', callout: { x: [745, 1171], top: 618 }, label: '建议你看看', note: '40 项、28.1 GB，写明依据，由你决定。', tone: 'review' },
  { step: 'sort', group: 'sort-info', callout: { x: [1181, 1607], top: 618 }, label: '仅供了解', note: '5 项、27.0 GB：游戏、Docker 和系统文件，只讲清楚、给出入口。', tone: 'info' },
  { step: 'sort', group: 'sort-bar', callout: { x: [700, 1250], top: 284 }, label: '容量条', note: '绿色斜纹是选中后能释放的 10.8 GB。', tone: 'safe' },
  { step: 'explain', group: 'explain-row', callout: { x: [860, 1590], bottom: 252 }, label: '这一项', note: 'Windows 更新下载缓存，990 MB，由内置规则认出，10 分。', tone: 'accent' },
  { step: 'explain', group: 'explain-basis', callout: { x: [388, 960], top: 622 }, label: '评分依据', tone: 'safe',
    note: '永久删除、不经过回收站；公认可以重建的缓存，10 分达到勾选门槛（5 分），所以自动勾选。' },
  { step: 'explain', group: 'explain-where', callout: { x: [1000, 1578], top: 622 }, label: '具体位置', note: 'C:\\Windows\\SoftwareDistribution\\Download，可以直接打开查看。', tone: 'accent' },
  { step: 'clean', group: 'clean-free', callout: { x: [700, 1300], top: 286 }, label: '可用空间', tone: 'safe',
    note: '从 19.7 GB 变成 29.8 GB：容量条上原来的绿色斜纹，现在是可用空间。' },
  { step: 'clean', group: 'clean-done', callout: { x: [900, 1600], bottom: 408 }, label: '清理结果', note: '10.1 GB 已释放；1 项 760 MB 在回收站，需要时可以还原。', tone: 'safe' },
  { step: 'clean', group: 'clean-left', callout: { x: [309, 900], top: 842 }, label: '剩下的', note: '还有 40 项建议你看看（28.1 GB），仍由你决定；仅供了解的 5 项只给说明。', tone: 'review' },
];

// 「空间都在哪里」: one strip per category row; each rises as the scan line passes its middle.
const chartRows: Array<[number, number]> = [[701, 737], [737, 771], [771, 806], [806, 841], [841, 877], [877, 912], [912, 947], [947, 982]];
const swept = (top: number, bottom: number) => Math.round((top + bottom) / 2 / PANXU_SHOT.height * PANXU_SWEEP_MS);
// The green stripes of the disk bar: selected and releasable in the plan, free space after cleaning.
const releasable: PanxuRect = [1444, 191, 1510, 230];

export const panxuLayers: PanxuLayer[] = [
  { id: 'scan-free', step: 'scan', group: 'scan-free', rect: [300, 86, 1030, 184], depth: 44, delay: swept(86, 184) },
  ...chartRows.map(([top, bottom], index): PanxuLayer => ({
    id: `scan-row-${index + 1}`, step: 'scan', group: 'scan-chart', rect: [318, top, 1598, bottom], depth: 28, delay: swept(top, bottom),
  })),
  { id: 'sort-bar', step: 'sort', group: 'sort-bar', rect: [300, 186, 1615, 274], depth: 22, delay: 320,
    marker: { rect: releasable, chip: '选中的 10.8 GB 可以释放' } },
  { id: 'sort-safe', step: 'sort', group: 'sort-safe', rect: [309, 460, 735, 605], depth: 96, delay: 0, chip: '默认勾好' },
  { id: 'sort-review', step: 'sort', group: 'sort-review', rect: [745, 460, 1171, 605], depth: 62, delay: 110, chip: '由你决定' },
  { id: 'sort-info', step: 'sort', group: 'sort-info', rect: [1181, 460, 1607, 605], depth: 34, delay: 220, chip: '只讲清楚' },
  { id: 'explain-row', step: 'explain', group: 'explain-row', rect: [309, 260, 1607, 341], depth: 40, delay: 0 },
  { id: 'explain-basis', step: 'explain', group: 'explain-basis', rect: [388, 352, 1578, 532], depth: 88, delay: 160, chip: '为什么是 10 分' },
  { id: 'explain-where', step: 'explain', group: 'explain-where', rect: [388, 540, 1578, 612], depth: 58, delay: 300 },
  { id: 'clean-free', step: 'clean', group: 'clean-free', rect: [300, 86, 1300, 184], depth: 72, delay: 0 },
  { id: 'clean-bar', step: 'clean', group: 'clean-free', rect: [300, 186, 1615, 274], depth: 30, delay: 120,
    marker: { rect: releasable, chip: '+10.1 GB 变成可用' } },
  { id: 'clean-done', step: 'clean', group: 'clean-done', rect: [309, 416, 1607, 622], depth: 54, delay: 240 },
  { id: 'clean-left', step: 'clean', group: 'clean-left', rect: [309, 636, 1607, 830], depth: 26, delay: 360 },
];

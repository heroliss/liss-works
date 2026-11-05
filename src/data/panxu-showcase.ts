/**
 * The 盘序 home showcase. Every number comes from one real 一键体检 run of PanXu 1.1.0
 * in its generated 演练环境 (see verification/panxu-captures-20261105): the simulated
 * C: drive is 256 GB with 19.7 GB free; the plan holds 22 + 40 + 5 items.
 */
export type PanxuGroup = 'safe' | 'review' | 'info';

export interface PanxuDrawer {
  id: string;
  name: string;
  size: string;
  group: PanxuGroup;
  /** One real row from the plan, shown when the drawer is opened. */
  example: string;
  note: string;
  /** Small file blocks inside the drawer; their colours follow each item's group. */
  files: PanxuGroup[];
}

export const panxuGroups: Record<PanxuGroup, { label: string; size: string; count: string }> = {
  safe: { label: '放心清理', size: '10.8 GB', count: '22 项，默认勾好' },
  review: { label: '建议你看看', size: '28.1 GB', count: '40 项，由你决定' },
  info: { label: '仅供了解', size: '27.0 GB', count: '5 项，只给说明和入口' },
};

export const panxuDrawers: PanxuDrawer[] = [
  { id: 'junk', name: '垃圾文件', size: '13.8 GB', group: 'safe', example: 'Windows 更新下载缓存 · 990 MB · 10 分',
    note: '内置规则认出的可重建缓存和临时文件，大部分已经勾好。', files: ['safe', 'safe', 'safe', 'safe', 'safe', 'safe', 'review', 'review'] },
  { id: 'apps', name: '应用数据', size: '14.1 GB', group: 'review', example: '开发工具与应用的缓存目录 · AI 复核',
    note: '属于你装过的程序，盘序说明它是谁的、现在还用不用，再由你决定。', files: ['review', 'review', 'review', 'review', 'review', 'safe', 'review'] },
  { id: 'large', name: '很久没动过的大文件', size: '9.4 GB', group: 'review', example: '个人文件只移到回收站，从不自动勾选',
    note: '按大小和最后修改时间列出，你的文件只由你决定。', files: ['review', 'review', 'review', 'review', 'review'] },
  { id: 'setup', name: '安装包与没下完的文件', size: '1.4 GB', group: 'review', example: 'QuickView_Setup_v5.2.exe · 程序已经装好',
    note: '已装程序的安装包、没下完的下载和解压过的压缩包，各自写明依据。', files: ['review', 'review', 'review', 'review'] },
  { id: 'system', name: '游戏、Docker 与系统文件', size: '27.0 GB', group: 'info', example: '休眠文件 · 3.2 GB · 可用 powercfg /h off 关闭',
    note: 'Steam 游戏、Docker 数据、页面文件、休眠文件和组件存储：只讲清楚是什么、该去哪里调整，不放进清理方案。', files: ['info', 'info', 'info', 'info', 'info'] },
];

export interface PanxuStep {
  id: string;
  label: string;
  title: string;
  body: string;
  readout: string;
  readoutNote: string;
  shot: string;
}

export const panxuSteps: PanxuStep[] = [
  { id: 'scan', label: '一键体检', title: '先把占空间的东西找出来', readout: '67 项', readoutNote: '共 65.9 GB 待整理',
    body: '依次检查垃圾、系统盘空间、我的文件和重复文件。内置规则先认出常见情况，规则不认识的再交给 AI 复核。', shot: '01-checkup-plan' },
  { id: 'sort', label: '分成三组', title: '能放心清的，已经替你勾好', readout: '10.8 GB', readoutNote: '放心清理 · 其余 55.1 GB 由你决定',
    body: '放心清理默认勾好；建议你看看和仅供了解只给依据和入口。你的个人文件从不自动勾选，只会移到回收站。', shot: '02-plan-scores' },
  { id: 'explain', label: '讲清楚', title: '每一项都写明依据', readout: '10 分', readoutNote: 'Windows 更新下载缓存 · 990 MB',
    body: '展开任意一项：它是什么、为什么列出、清理后会怎样，以及 0–10 分的建议清理度和勾选理由。', shot: '03-score-basis' },
  { id: 'clean', label: '清理并记下', title: '释放多少，说得清楚', readout: '+10.1 GB', readoutNote: '可用 19.7 → 29.8 GB · 760 MB 在回收站',
    body: '缓存直接删除，其余移到回收站；结果分开显示释放的空间和回收站里的空间，每次修改都记进操作记录。', shot: '05-cleanup-result' },
];

export const panxuDisk = { total: 256, freeBefore: 19.7, freeAfter: 29.8 };

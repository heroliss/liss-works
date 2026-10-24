import type { Project } from './types';
import { projectImage as image } from './project-image.ts';
import { qtLabs, textLab, systemsLab } from './restored-bundles.ts';

const qt = [
  image('qt-labs', '01-os-fragmented.jpg', 1402, 1032, '时间片轮转中的 PCB、连续内存图与进程占用，空闲碎片在空间中可见。', 'OS 调度与内存'),
  image('qt-labs', '02-os-compacted.jpg', 1402, 1032, '内存紧凑后合并连续空闲区，PCB 首地址与各进程的内存位置同步更新。', '内存紧凑'),
  image('qt-labs', '03-os-queues-and-events.jpg', 1402, 1032, '运行、就绪与阻塞队列，配合内存图、PCB 和事件轨迹观察状态转换。', '进程状态与事件'),
  image('qt-labs', '05-huffman-roundtrip.jpg', 1402, 1032, '压缩与解压往返后，字节频率、前缀码、平均码长和完整性校验同屏。', 'Huffman 编码与完整性'),
  image('qt-labs', '06-huffman-process-log.jpg', 1402, 1032, '文件处理记录连接频率统计、最小堆建树与比特流输出，保留原文件。', 'Huffman 处理过程'),
  image('qt-labs', '10-calculator-expression.jpg', 1402, 1032, '科学表达式的结果、历史、逆波兰式和逐步求值路径在一个窗口中对应。', '科学计算与求值轨迹'),
];

const systems = [
  image('systems-lab', '01-paging-comparison.jpg', 1382, 932, 'FIFO、LRU 与 OPT 的缺页数、命中率和页框访问时间线同屏比较。', '三策略分页对照'),
  image('systems-lab', '02-device-resource-chain.jpg', 1382, 932, '设备、控制器与通道组成排他资源链，已分配与等待请求各有明确状态。', '设备资源链'),
  image('systems-lab', '03-banker-safe-sequence.jpg', 1382, 932, '最大需求、已分配、剩余需求与可用资源共同决定当前的安全序列。', '银行家安全检查'),
  image('systems-lab', '04-prime-density-and-results.jpg', 1382, 932, '百万范围质数计算的统计、等宽区间分布、数值预览与会话记录。', '质数结果与分布'),
  image('systems-lab', '05-device-queue-advance.jpg', 1382, 932, '释放资源后，等待请求获得整条资源链，资源图与请求队列一起更新。', '等待队列推进'),
  image('systems-lab', '06-banker-granted-request.jpg', 1382, 932, '通过安全检查的请求被提交，已分配、剩余需求、可用资源与安全序列同步变化。', '安全请求的提交'),
  image('systems-lab', '08-prime-canceled-partial.jpg', 1382, 932, '手动停止长计算后，已处理范围与部分结果明确标记，并保留在会话记录中。', '停止与部分结果'),
];

const text = [
  image('text-lab', '01-segmentation-overview.jpg', 1382, 952, '原文、切分视图、词频表与分布条形图组成分词工作区。', '分词与词频'),
  image('text-lab', '02-proofreading-and-rules.jpg', 1382, 952, '固定用语建议对应原文位置，选择后查看理由并逐条确认。', '规则与人工确认'),
  image('text-lab', '03-mixed-encoding-search.jpg', 1382, 952, 'UTF-8 与 GB18030 文件的检索结果保留相对路径、行号、编码与只读上下文。', '多编码文件检索'),
  image('text-lab', '04-local-imported-word2vec.jpg', 1382, 952, '导入本机 word2vec 后查看语义近邻，词向量参考与固定用语规则分开呈现。', '词向量与语义近邻'),
  image('text-lab', '05-context-window-scoring.jpg', 1382, 952, '双侧上下文窗口给出词语位置与平均相似度，辅助人工观察语义差异。', '上下文窗口参考'),
];

const nex = [
  image('nex', '01-workspace-and-priority.jpg', 1442, 932, '计划清单、当前专注、优先级与事项详情组成三栏工作空间。', '桌面工作空间'),
  image('nex', '02-completed-and-persistence.jpg', 1442, 932, '已完成事项的分类、备注与预计用时，配合状态筛选查看。', '完成状态与详情'),
  image('nex', '03-single-focus-and-filter.jpg', 1442, 932, '筛选当前专注事项，清单、详情与本机保存的单一进行中状态相互对应。', '单一专注与状态筛选'),
];
const blocks = [
  image('liss-blocks', '01-practice-board-and-preview.jpg', 1242, 912, '固定练习局中的活动方块、落点预览、五块预告与键盘操作说明。', '练习局与落点预览'),
  image('liss-blocks', '02-four-line-clear-and-hold.jpg', 1242, 912, '四行消除后的得分、暂存方块与下一组预告同屏。', '四行消除与计分'),
  image('liss-blocks', '03-counterclockwise-and-hold.jpg', 1242, 912, '交换暂存后逆时针旋转 T 方块，棋盘、暂存与后续方块同步变化。', '反向旋转与暂存'),
  image('liss-blocks', '04-pause-and-controls.jpg', 1242, 912, 'P 暂停后的棋盘遮罩，保留成绩、消行数与操作说明，可继续游戏。', '暂停与操作说明'),
];

export const restoredProjects: Project[] = [
  { ...qtLabs, cover: qt[0], gallery: qt },
  { ...textLab, cover: text[0], gallery: text },
  { ...systemsLab, cover: systems[0], gallery: systems },
  {
    slug: 'nex', repo: 'nex', name: 'NEX · 下一件值得做的事', category: '离线计划与专注工具', group: 'games',
    summary: '把计划排出轻重缓急，让当前只专注于一件值得做的事。',
    intro: '来自早期自写计划管理工具的本机工作空间。分类、重要程度、紧急程度与预计用时帮助整理行动，单一专注状态连接计划与执行，SQLite 自动保留事项和编辑结果。',
    status: 'Windows 版已发布', tags: ['C#', '.NET 10', 'SQLite', 'WinForms'],
    features: [
      { title: '有依据的优先级', body: '重要程度与五级紧急度形成明确分值，列表同时保留事项状态和预计用时。' },
      { title: '单一专注', body: '开始新事项时原专注事项回到待处理，事务与唯一索引共同维护状态。' },
      { title: '离线记录', body: '增删改、筛选与搜索全部在本机完成，JSON 导出提供可阅读备份。' },
    ],
    usage: [
      { title: '解压后直接使用', body: '完整解压 Windows x64 ZIP，运行 Liss.Nex.exe，无需安装 .NET。首次工作空间为空白，可按需添加示例事项。' },
      { title: '整理下一件事', body: 'Ctrl+N 新建，设置分类、重要程度、紧急程度和预计用时；Ctrl+S 保存，选择“开始专注”进入进行中状态。' },
      { title: '保留自己的数据', body: '数据位于 %LOCALAPPDATA%\\Liss\\Nex，不随程序更新覆盖。可导出 JSON；完整数据库备份前请先关闭应用，再复制该目录。' },
    ],
    note: '截止日期在同分时辅助排序，不会自动提高过期任务分数。数据保存在本机，不提供云同步。',
    source: 'https://github.com/heroliss/nex', docs: 'https://github.com/heroliss/nex#readme',
    download: { repository: 'heroliss/nex', assetPattern: '^Liss-NEX(?:-v?\\d+(?:\\.\\d+)*)?-win-x64\\.zip$' },
    cover: nex[0], gallery: nex, related: ['sort-lab', 'text-lab', 'liss-web'],
  },
  {
    slug: 'liss-blocks', repo: 'liss-blocks', name: 'Liss Blocks · 方块之间', category: 'Windows 方块游戏', group: 'games',
    summary: '七种方块、一个棋盘，把预判、移动与消行连接成完整的游戏循环。',
    intro: '源自 2015 年自写方块游戏的桌面实践。独立游戏状态负责规则，代码绘制的深色棋盘负责呈现；包含随机袋、暂存、预告、落点、消行、计分与暂停重开。',
    status: 'Windows 版已发布', tags: ['C#', '.NET 10', 'WinForms', '游戏状态机'],
    features: [
      { title: '提前规划', body: '7-bag 随机袋、五块预告、暂存与落点预览为下一次操作提供依据。' },
      { title: '完整规则循环', body: '移动、顺逆时针旋转、软硬降、锁定、消行、升级与结束共用一份游戏状态。' },
      { title: '轻量桌面体验', body: '双缓冲绘图、键盘长按连发和自动失焦暂停，不依赖外部美术素材。' },
    ],
    usage: [
      { title: '解压后游玩', body: '完整解压 Windows x64 ZIP，运行 Liss.Blocks.exe，无需安装 .NET 或资源包。' },
      { title: '移动与旋转', body: '← → 移动，↓ 加速，↑ / X 顺时针，Z 逆时针；Space 硬降，C 暂存或交换，P / Esc 暂停。' },
      { title: '新局或固定练习', body: 'R 开始新的一局；“练习局”提供固定堆叠。--showcase 从暂停的练习局进入，按 P 继续。', code: '.\\Liss.Blocks.exe --showcase', language: 'powershell' },
    ],
    note: '固定练习局从零计分，成绩不跨启动保存。',
    source: 'https://github.com/heroliss/liss-blocks', docs: 'https://github.com/heroliss/liss-blocks#readme',
    download: { repository: 'heroliss/liss-blocks', assetPattern: '^Liss-Blocks(?:-v?\\d+(?:\\.\\d+)*)?-win-x64\\.zip$' },
    cover: blocks[0], gallery: blocks, related: ['gomoku', 'outpost', 'sort-lab'],
  },
];

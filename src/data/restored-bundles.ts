import type { Project } from './types';

type ProjectDescription = Omit<Project, 'cover' | 'gallery'>;

export const qtLabs: ProjectDescription = {
  slug: 'qt-labs', repo: 'qt-labs', name: 'Liss Qt Labs · 三个 C++ 桌面实验', category: 'C++ 与 Qt 桌面合集', group: 'graphics',
  summary: '调度、压缩与表达式计算，把三种内部过程变成可以操作的窗口。',
  intro: '由早期 C++ / Qt 工程组成的桌面合集：OS Lab 观察进程与内存，Huffman Lab 解释字节编码，Calculator 展示科学表达式的求值过程。三个应用共用清晰的深色界面语言。',
  status: 'Windows 版已发布', tags: ['C++', 'Qt 6', 'CMake', 'Huffman 算法'],
  features: [
    { title: '调度与内存相互对应', body: '时间片轮转、三态队列、PCB 与连续内存图保持同步，支持分配、释放和紧凑。' },
    { title: '压缩可以解释和核对', body: '自写 Huffman 前缀编码，显示频率与码长，流式处理并校验恢复文件的摘要。' },
    { title: '表达式有可见的过程', body: '手写双栈求值器，支持科学函数、角度模式、变量、记忆与求值轨迹。' },
  ],
  usage: [
    { title: '一个包，三个程序', body: '完整解压 Windows x64 ZIP，分别运行 LissOsLab.exe、LissHuffmanLab.exe 或 LissCalculator.exe；保留同目录 DLL、plugins 与 third-party 文件夹。' },
    { title: '从一个过程开始', body: 'OS Lab 创建进程并单步推进；Huffman Lab 选择文件压缩、解压；Calculator 输入表达式，查看结果和求值轨迹。' },
    { title: '查看可操作样例', body: '各程序支持 --showcase 载入示例；样例仍使用同一业务模型，可以继续修改和运行。', code: '.\\LissOsLab.exe --showcase\n.\\LissHuffmanLab.exe --showcase\n.\\LissCalculator.exe --showcase', language: 'powershell' },
  ],
  source: 'https://github.com/heroliss/qt-labs', docs: 'https://github.com/heroliss/qt-labs#readme',
  download: { repository: 'heroliss/qt-labs', assetPattern: '^Liss-QtLabs(?:-v?\\d+(?:\\.\\d+)*)?-win-x64\\.zip$' },
  related: ['systems-lab', 'text-lab', 'learnopengl'],
};

export const textLab: ProjectDescription = {
  slug: 'text-lab', repo: 'text-lab', name: 'Liss Text Lab · 文字处理实验室', category: '本地中文处理工作台', group: 'ai-data',
  summary: '分词、词频、校对与文件检索，在本机探索文字结构和语义线索。',
  intro: '将早期的改错字、分词工具与 FindText 组织成三个工作区。使用 Jieba 处理中文分词，规则与自备词向量辅助人工校对，流式文件检索保留编码、路径与行号。',
  status: 'Windows 版已发布', tags: ['C#', '.NET 10', 'Jieba', 'NLP', 'word2vec'],
  features: [
    { title: '分词与统计联动', body: '多种分词模式、原文位置、词频表和图表同屏，支持自定义词与目录批量处理。' },
    { title: '校对依据可见', body: '固定用语建议由用户确认，自备词向量提供上下文和语义近邻参考。' },
    { title: '文件内容可追溯', body: '流式扫描目录，显示编码、行号和上下文；大输入支持取消并保留部分结果。' },
  ],
  usage: [
    { title: '离线打开', body: '完整解压 Windows x64 ZIP，运行 Liss.TextLab.exe，无需安装 .NET，文本和模型均在本机处理。' },
    { title: '选择工作区', body: '粘贴或打开文本查看分词与词频；在校对页逐项确认建议，在检索页选择目录和关键词。批量输出与原文目录分开。' },
    { title: '按需探索语义', body: '导入自己有权使用的 word2vec .bin 或文本 .vec / .txt，查看语义近邻和双侧上下文；默认不附带 word2vec 词向量模型。' },
  ],
  note: '中文分词由第三方 Jieba 实现提供。规则校对与词向量参考分开呈现，语义相似度不等于纠错准确率；无 BOM 文本可手动指定编码。',
  source: 'https://github.com/heroliss/text-lab', docs: 'https://github.com/heroliss/text-lab#readme',
  download: { repository: 'heroliss/text-lab', assetPattern: '^Liss-TextLab(?:-v?\\d+(?:\\.\\d+)*)?-win-x64\\.zip$' },
  related: ['dubforge', 'nex', 'sort-lab'],
};

export const systemsLab: ProjectDescription = {
  slug: 'systems-lab', repo: 'systems-lab', name: 'Liss Systems Lab · 系统与算法实验台', category: '系统与算法可视化', group: 'graphics',
  summary: '修改输入、推进状态，观察分页、资源分配与质数计算怎样得到结果。',
  intro: '将请求分页、设备管理、银行家算法和质数实验组成四个可操作工作区。C++20 核心计算独立状态，.NET 桌面界面用访问时间线、资源链、矩阵与分布图表达结果。',
  status: 'Windows 版已发布', tags: ['C++', 'C#', '.NET 10', 'P/Invoke', '系统算法'],
  features: [
    { title: '状态可以逐步观察', body: '分页三策略使用同一访问序列，页框、命中和缺页在时间线上对应。' },
    { title: '分配先有规则', body: '设备资源链原子申请并按顺序调度，银行家试分配只在安全时提交。' },
    { title: '结果与计算代价同屏', body: '两种质数方法对照范围、数量与耗时，后台任务可取消并保留部分区间。' },
  ],
  usage: [
    { title: '完整解压运行', body: '完整解压后运行 Liss.SystemsLab.exe，自带桌面运行时与原生核心，无需另装 SDK 或 Visual Studio。' },
    { title: '修改并观察', body: '分页可改序列和页框后重新计算；设备页申请与释放资源；银行家页编辑矩阵再请求资源；质数页选择方法与范围。' },
    { title: '打开指定工作区', body: '--showcase 可选择 paging、devices、banker 或 primes。质数工作区的示例会计算一百万以内的质数。', code: '.\\Liss.SystemsLab.exe --showcase banker', language: 'powershell' },
  ],
  source: 'https://github.com/heroliss/systems-lab', docs: 'https://github.com/heroliss/systems-lab#readme',
  download: { repository: 'heroliss/systems-lab', assetPattern: '^SystemsLab(?:-v?\\d+(?:\\.\\d+)*)?-win-x64\\.zip$' },
  related: ['qt-labs', 'route-lab', 'floydshortestpath'],
};

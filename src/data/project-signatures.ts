export interface ProjectSignature {
  direction: string;
  principle: string;
  highlights: [string, string, string];
}

const signatures: Record<string, ProjectSignature> = {
  'glass-atoll': {
    direction: '实时海岛 / WebGL 视觉体验',
    principle: '让天空、浅海与一座岛在同一片光里呼吸。',
    highlights: ['可漫游的海岸', '昼夜与天气', '水面与烟花倒影'],
  },
  mkfun: {
    direction: 'Python 工具 / 结构映射',
    principle: '用样例表达位置，让规则与结果都可解释。',
    highlights: ['样例编译规则', '逐项来源路径', '本次往返校验'],
  },
  'utility-lab': {
    direction: '浏览器工具 / 本地数据',
    principle: '先看清表示与变化，再决定如何使用。',
    highlights: ['Unicode 编码对照', '改名前预览冲突', '本机处理与撤销'],
  },
  nomadworkshop: {
    direction: '生活模拟 / 游戏 AI',
    principle: '先让规则成立，再让世界动起来。',
    highlights: ['完整行动决策', '资源预留账本', '可恢复存档'],
  },
  outpost: {
    direction: '游戏玩法 / 实时表现',
    principle: '分开规则与画面，用完整游戏验证。',
    highlights: ['纯 C# 战斗', '真弹道结算', '可切换后端'],
  },
  ssframework: {
    direction: 'Unity 架构 / 开发工具',
    principle: '让分层、作用域与所有权都有边界。',
    highlights: ['类型化业务分层', '资源生命周期', 'Hierarchy 节点绑定'],
  },
  panxu: {
    direction: 'Windows 工具 / AI 辅助磁盘清理',
    principle: '63 项规则与 AI 各司其职，把能不能删讲得明明白白。',
    highlights: ['63 项规则 + 结构识别', '0–10 分清理依据', '绿色免安装 · 可撤销'],
  },
  dubforge: {
    direction: '本地视频译制 / 多平台发布工作台',
    principle: '自动流程省心跑通，关键细节随时接管，改哪句只重做哪句。',
    highlights: ['双语字幕 + 音色配音', '8GB 本地 AI 横竖双封面', 'B 站 · 抖音双轨发布'],
  },
  eazybuildpipeline: {
    direction: 'Unity 编辑器 / 构建管线',
    principle: '把真实项目需求，整理成可配置的流程。',
    highlights: ['标签驱动规则', '反向依赖检查', '模块化构建'],
  },
  'intelligence-index-cost-linear': {
    direction: 'AI 模型选型与花费指南',
    principle: '少被虚高考分和折算价格绕晕，按日常用途挑对模型、算清真实账单。',
    highlights: ['6 大频道 + 场景配方', '最多 8 款微距同台对比', '包月会员 vs 按次算账'],
  },
  'china-house-price-map': {
    direction: '买房与租房找房工具',
    principle: '少翻零散房源帖，先在地图上把通勤、预算和周边底细一次看清。',
    highlights: ['3 步向导跨城筛片区', '任意公司门口画通勤圈', '买房 / 四户型租房一键切'],
  },
  learnopengl: {
    direction: '图形渲染 / GPU 编程',
    principle: '让公式、参数与眼前的画面互相印证。',
    highlights: ['视差与自阴影', '离屏后处理', '同屏参数调试'],
  },
  'aoe4-flow': {
    direction: '帝国时代 4 / 视觉自动化',
    principle: '围绕实际游戏，把重复操作编排成可观察的流程。',
    highlights: ['双流节点图', '跨段资源预算', '逐帧识别复用'],
  },
  'ga-sort': {
    direction: '进化计算 / 程序演化',
    principle: '编码候选行为，用适应度引导搜索。',
    highlights: ['操作序列基因', '可替换算子', '固定种子重现'],
  },
  floydshortestpath: {
    direction: '图算法 / Unity 组件',
    principle: '用一次预计算，简化反复的距离查询。',
    highlights: ['全点对最短路', '前驱路径还原', '无引擎依赖'],
  },
  'liss-web': {
    direction: 'Web 全栈 / 内容社区',
    principle: '低门槛参与，让身份与内容长期留存。',
    highlights: ['访客与可选邮箱', 'Markdown 写作', '可恢复内容管理'],
  },
  gomoku: {
    direction: '博弈搜索 / Windows 游戏',
    principle: '搜索参数各自设置，对局状态始终清楚。',
    highlights: ['黑白独立配置', '随棋谱查看统计', '明确的联机状态'],
  },
  'route-lab': {
    direction: '组合优化 / 算法可视化',
    principle: '同一组城市，看清不同搜索过程。',
    highlights: ['遗传与退火对照', '真实收敛曲线', '固定种子复现'],
  },
  'sort-lab': {
    direction: '算法实验 / 运行时编译',
    principle: '先看清正在做什么，再比较算法表现。',
    highlights: ['明确任务与跳过目标', '算法阶段状态矩阵', '核心源码可编辑'],
  },
  'qt-labs': {
    direction: 'C++ 桌面 / 可视算法',
    principle: '把输入、内部状态与结果放在同一个窗口。',
    highlights: ['调度与内存同屏', '流式压缩与校验', '表达式求值轨迹'],
  },
  'text-lab': {
    direction: '中文处理 / 本地工具',
    principle: '建议说明依据，文本始终在本机处理。',
    highlights: ['分词与词频联动', '词向量语义探索', '带编码的文件检索'],
  },
  'systems-lab': {
    direction: '系统模拟 / C++ 互操作',
    principle: '逐步观察状态，再用结果检验理解。',
    highlights: ['三策略分页对照', '安全分配与排队', '可取消质数实验'],
  },
  nex: {
    direction: '桌面效率 / 本机持久化',
    principle: '推荐说明依据，下一步由自己决定。',
    highlights: ['可解释时效推荐', '可选时间预算', '单一专注事务'],
  },
  'liss-blocks': {
    direction: '桌面游戏 / 状态驱动',
    principle: '规则独立于画面，每次操作都有反馈。',
    highlights: ['7-bag 与五块预告', '暂存与落点预览', '完整消行计分循环'],
  },
};

export function getProjectSignature(slug: string): ProjectSignature {
  const signature = signatures[slug];
  if (!signature) throw new Error(`Missing project signature: ${slug}`);
  return signature;
}

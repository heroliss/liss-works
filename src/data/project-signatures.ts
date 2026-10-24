export interface ProjectSignature {
  direction: string;
  principle: string;
  highlights: [string, string, string];
}

const signatures: Record<string, ProjectSignature> = {
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
  dubforge: {
    direction: 'AI 应用 / 媒体工作流',
    principle: '按依赖复用结果，让修改与恢复有据可查。',
    highlights: ['逐句精修', '输入指纹复用', '多版本成片'],
  },
  eazybuildpipeline: {
    direction: 'Unity 编辑器 / 构建管线',
    principle: '把真实项目需求，整理成可配置的流程。',
    highlights: ['标签驱动规则', '反向依赖检查', '模块化构建'],
  },
  'intelligence-index-cost-linear': {
    direction: '数据可视化 / 模型比较',
    principle: '用线性距离，直观看清能力与费用。',
    highlights: ['线性成本轴', '标签避让', 'Pareto 边界'],
  },
  'china-house-price-map': {
    direction: '地理可视化 / 数据探索',
    principle: '先看全国，再按需加载局部细节。',
    highlights: ['分省渐进加载', '地图列表联动', '数据口径标记'],
  },
  learnopengl: {
    direction: '图形渲染 / GPU 编程',
    principle: '让公式、参数与眼前的画面互相印证。',
    highlights: ['视差与自阴影', '离屏后处理', '同屏参数调试'],
  },
  'aoe4-autovillager-tool': {
    direction: '视觉识别 / 流程自动化',
    principle: '把重复操作拆成可观察、可组合的流程。',
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
    direction: 'Web 后端 / 全栈实践',
    principle: '用关系模型，串起账户、内容与互动。',
    highlights: ['Flask 蓝图', 'Markdown 预览', '权限与关系建模'],
  },
};

export function getProjectSignature(slug: string): ProjectSignature {
  const signature = signatures[slug];
  if (!signature) throw new Error(`Missing project signature: ${slug}`);
  return signature;
}

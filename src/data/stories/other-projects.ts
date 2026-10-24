import type { ProjectStory } from '../story-types';

export const otherStories: Record<string, ProjectStory> = {
  nomadworkshop: {
    origin: {
      title: '验证 AI 驱动的游戏开发',
      paragraphs: ['我个人首个以 AI 驱动开发、验证 vibe coding 能否支撑复杂游戏的项目。以废土移动小家连接居民、资源与建造；游戏内的居民决策另由 Utility AI 驱动。'],
    },
    stack: [
      { name: 'Unity 6 / URP', role: '场景、画面与居民动作表现。' },
      { name: '纯 C# / Utility AI', role: '承载需求模拟与完整行动决策。' },
      { name: 'AI Navigation', role: '连接甲板通行与设施交互位置。' },
      { name: 'SSFramework', role: '组织状态、命令与游戏生命周期。' },
    ],
    sections: [{
      id: 'living-simulation', title: '让世界持续运转',
      items: [
        { title: '完整行动决策', body: ['将取罐、装水、路程与交付作为完整方案，结合需求、风险和偏好选择行动。'] },
        { title: '有所有权的资源', body: ['账本统一预留水量、容器与工作位；多人争用或行动取消时，资源仍有明确归属。'] },
        { title: '可恢复的模拟', body: ['固定步长与隔离随机流支持重现；版本化存档保存业务状态，加载时重建导航缓存。'] },
      ],
    }],
  },
  outpost: {
    origin: {
      title: '用游戏验证框架',
      paragraphs: ['SSFramework 的独立教程游戏与真实消费示例。用波次防守把纯 C# 模拟、Unity 表现、资源和界面接成完整循环，从标题进入战场，再经强化走到撤离结算。'],
    },
    stack: [
      { name: '纯 C#', role: '推进敌人、弹丸、伤害与波次。' },
      { name: 'Unity 6 / URP', role: '呈现炮台、弹流、冲击与灯光。' },
      { name: 'SSFramework', role: '连接状态、命令与资源生命周期。' },
      { name: 'UI Toolkit / uGUI', role: '构建菜单、战斗 HUD 与强化卡片。' },
    ],
    sections: [{
      id: 'battle-architecture', title: '规则与表现分层',
      items: [
        { title: '模拟负责命中', body: ['内核推进真实弹丸，以扫掠检测结算移动中的命中；特效不决定伤害。'] },
        { title: '事件驱动画面', body: ['击发、命中与击杀分别触发表现，对象池和每帧预算控制特效开销。'] },
        { title: '统一后端入口', body: ['OOP 与 DOTS / ECS 实现共用战斗接口，界面可切换并观察当前后端。'] },
      ],
    }],
  },
  eazybuildpipeline: {
    origin: {
      title: '第一份工作的用心之作',
      paragraphs: ['刚入行时，我为真实项目中的资源导入、依赖排查与构建需求投入心血，做了这套工具。它把重复操作整理成可配置、可组合的模块，如今通用部分已适配 Unity 6。'],
    },
    stack: [
      { name: 'Unity Editor / IMGUI', role: '构建总控、配置面板与依赖树。' },
      { name: 'AssetDatabase', role: '读取资产引用、标签与资源清单。' },
      { name: 'C# / JSON', role: '保存规则、版本与各平台参数。' },
      { name: 'BuildPipeline', role: '连接 Bundle 与 Player 构建阶段。' },
    ],
    sections: [{
      id: 'asset-workflow', title: '把重复流程变成工具',
      items: [
        { title: '标签驱动规则', body: ['按标签表达式选择资源，再批量配置平台尺寸、压缩格式与质量。'] },
        { title: '引用关系可检查', body: ['反向依赖树回答“谁在使用它”，结合依赖根和 Bundle 清单辅助定位无用资源。'] },
        { title: '阶段可以组合', body: ['总控串联预处理、Bundle、分包与 Player 构建，统一管理宏定义和平台参数。'] },
      ],
    }],
  },
  'intelligence-index-cost-linear': {
    origin: {
      title: '看清 AI 能力与费用',
      paragraphs: ['为了更好地选择和购买 AI，我把公开能力指数与任务成本放在同一张图里。线性成本轴直观表达价格差距，再通过交互聚焦模型，让能力提升与费用取舍更容易一起理解。'],
    },
    stack: [
      { name: 'JavaScript / SVG', role: '绘制坐标、模型点与交互标签。' },
      { name: 'Node.js', role: '提取公开数据并统一模型字段。' },
      { name: 'GitHub Actions / Pages', role: '定时更新 JSON 并部署静态图表。' },
    ],
    sections: [{
      id: 'readable-comparison', title: '让密集数据可比较',
      items: [
        { title: '按需聚焦', body: ['横纵轴独立缩放，结合平移、供应商高亮与标签避让，在全局和细节间切换。'] },
        { title: '保留比较依据', body: ['Pareto 边界呈现能力与成本取舍；更新器兼容成本字段变化，防止异常空数据覆盖。'] },
      ],
    }],
  },
  'china-house-price-map': {
    origin: {
      title: '把价格放回地图',
      paragraphs: ['把住宅挂牌价格与行政边界结合，方便从全国格局逐步查看城市和区县。地图呈现空间关系，列表和详情补充数值、来源与口径，让各地价格分布可以在同一个入口中探索。'],
    },
    stack: [
      { name: 'JavaScript / SVG', role: '绘制价格色阶、边界与交互标注。' },
      { name: 'GeoJSON', role: '组织城市、区县与镇街行政边界。' },
      { name: 'Node.js', role: '合并价格数据并生成分省图层。' },
      { name: 'GitHub Pages / Actions', role: '托管静态地图并尝试定期更新。' },
    ],
    sections: [{
      id: 'progressive-map', title: '从概览进入细节',
      items: [
        { title: '渐进加载', body: ['全国先显示城市信息，放大后按省加载区县细节，部分城市继续细化到镇街。'] },
        { title: '联动阅读', body: ['搜索、地图和列表共用选中状态，配合标注避让、明暗主题与图层透明度探索。'] },
        { title: '口径随数据保留', body: ['独立区县价、沿用城市均价和补充估算分别说明，避免将同一色阶误读为同一来源。'] },
      ],
    }],
  },
  learnopengl: {
    origin: {
      title: '边学渲染，边看结果',
      paragraphs: ['利用空余时间自学底层图形渲染时，边学边做积累的工程。从窗口、几何和 Shader 走向光照、阴影与材质，再把参数放到画面旁边，直接观察法线、视差和后处理带来的变化。'],
    },
    stack: [
      { name: 'C++ / OpenGL 4.5', role: '管理 GPU 资源、绘制与帧缓冲。' },
      { name: 'GLSL', role: '实现光照、贴图、阴影与后处理。' },
      { name: 'GLFW / GLM', role: '提供窗口输入和向量矩阵运算。' },
      { name: 'Assimp / stb', role: '读取模型、纹理并导出实际帧。' },
      { name: 'ImGui', role: '同屏调整材质参数与调试显示。' },
    ],
    sections: [{
      id: 'rendering-experiments', title: '拆开一帧画面',
      items: [
        { title: '材质效果对照', body: ['同一木盒切换法线、视差遮蔽与自阴影，观察采样和光照怎样共同表达表面深度。'] },
        { title: '离屏与后处理', body: ['场景先进入 framebuffer，再应用灰度、卷积等效果；调试面板保持独立绘制。'] },
        { title: '让数据可见', body: ['法线与深度显示辅助检查，固定预设配合真实 GPU 帧导出，便于同视角比较。'] },
      ],
    }],
  },
  'aoe4-autovillager-tool': {
    origin: {
      title: '少分心，多打游戏',
      paragraphs: ['和朋友玩《帝国时代 4》时，为减轻持续出农的操作压力做了这个工具。经过多轮实际使用与优化，效果不错；后来把固定逻辑发展成节点引擎，方便组合识别、判断与生产操作。'],
    },
    stack: [
      { name: 'Python', role: '执行节点图并管理输入操作上下文。' },
      { name: 'LiteGraph.js / pywebview', role: '提供节点编辑、预览与断点调试。' },
      { name: 'OpenCV / OCR', role: '识别截图中的队列、人口与资源。' },
      { name: 'JSON 流程', role: '保存节点参数与两种流的连接。' },
    ],
    sections: [{
      id: 'automation-engine', title: '从识别到可靠操作',
      items: [
        { title: '两种流分工', body: ['执行流决定顺序，数据流传递识别结果；按帧缓存让多个节点复用一次截图。'] },
        { title: '共享生产预算', body: ['村民、乡骑与商人逐段扣减资源和人口预算，避免同一余额被重复使用。'] },
        { title: '现场可调试', body: ['预览、断点和单步暴露识别与分支；上下文兜底释放输入屏蔽和编组锁。'] },
      ],
    }],
  },
  'ga-sort': {
    origin: {
      title: '让操作序列自己演化',
      paragraphs: ['自行研究遗传算法时的实验产物。把数组交换或变量运算编码成基因，只用适应度描述结果好坏，观察种群能否经过选择、交叉与变异，找到排序步骤或计算 a + b × c 的算式。'],
    },
    stack: [
      { name: 'Python', role: '实现基因表达、评估与种群迭代。' },
      { name: '自定义 GA 算子', role: '通过配置替换选择、交叉与变异。' },
      { name: 'DEAP', role: '接入现成算子复用同一演化入口。' },
    ],
    sections: [{
      id: 'program-evolution', title: '编码决定搜索空间',
      items: [
        { title: '两种基因表达', body: ['交换序列实际操作数组，函数序列读取变量并运算；通用引擎与问题评估分离。'] },
        { title: '让实验可重看', body: ['固定种子复现演化，全零适应度仍维持种群；样例收敛不等于对所有输入正确。'] },
      ],
    }],
  },
  floydshortestpath: {
    origin: {
      title: '为实际寻路需求预计算',
      paragraphs: ['来自工作中 Unity 游戏项目的实际寻路需求。将经典 Floyd–Warshall 算法实现为轻量 C# 组件，对相对稳定的图一次计算全点对距离，再供业务反复查询距离与还原路线。'],
    },
    stack: [
      { name: 'C#', role: '计算邻接矩阵对应的距离和前驱。' },
      { name: '.NET Standard 2.1', role: '保持无引擎依赖，方便接入 Unity。' },
      { name: '.NET Console', role: '输出路径矩阵与可运行边界检查。' },
    ],
    sections: [{
      id: 'precomputed-paths', title: '用预处理换反复查询',
      items: [
        { title: '距离与路线一起保留', body: ['O(V³) 时间、O(V²) 空间预处理后，O(1) 读取距离，O(L) 还原长度为 L 的路线。'] },
        { title: '为稳定图取舍', body: ['适合规模可控的稳定图、多次查询；路网频繁变化或仅查询少量路径时，应比较按需搜索。'] },
      ],
    }],
  },
  'liss-web': {
    origin: {
      title: '把 Web 学习串成交流空间',
      paragraphs: ['Liss Community 起于自学 Flask 后端与前端 Web 技术时的实操练习。用社交博客把账户、权限和内容交互接成完整流程，曾部署于 Heroku；如今适配现代环境，以新的深色界面承载记录与交流。'],
    },
    stack: [
      { name: 'Flask / Jinja2', role: '组织路由、接口与服务端页面模板。' },
      { name: 'SQLAlchemy / Alembic', role: '维护关系模型与数据库迁移历史。' },
      { name: 'CSS / Markdown', role: '组织深浅主题、响应式阅读与实时写作预览。' },
      { name: 'Brevo / HTTPS API', role: '发送邮箱验证、绑定与密码找回邮件。' },
    ],
    sections: [{
      id: 'connected-web-app', title: '让内容与用户连接',
      items: [
        { title: '关系驱动内容', body: ['角色权限、关注、文章与评论共用数据库模型，页面和 REST API 从同一数据提供入口。'] },
        { title: '写作真正落库', body: ['EasyMDE 提供 Markdown 编辑与预览，输出 HTML 经过清理；文章和评论持久保存在 SQLite，配合一致性备份与恢复。'] },
      ],
    }, {
      id: 'durable-accounts', title: '从访客到可找回的账号',
      items: [
        { title: '身份延续，邮箱可选', body: ['访客升级账号沿用同一个用户 ID，文章、评论与关注关系无需搬迁。邮箱可以留空，之后也能绑定或更换。'] },
        { title: '验证、绑定与密码找回', body: ['通过 Brevo HTTPS API 发送验证、绑定与找回邮件；更换邮箱需确认后生效，发信失败也保留账号与内容。'] },
        { title: '限时令牌与发送限流', body: ['确认与找回链接使用 1 小时有效、按用途隔离的签名令牌，配合 CSRF 校验与发送限流。邮件密钥独立保存在服务器私有配置中。'] },
      ],
    }],
  },
  gomoku: {
    origin: {
      title: '找回旧棋盘，继续做一版',
      paragraphs: ['早期独立开发的五子棋程序，围绕多种搜索算法与实时联机展开实践。以保留下来的 v2.3 工程延续开发为 V3，更新规则、棋谱与界面，并加入独立可选的威胁搜索。'],
    },
    stack: [
      { name: 'C# / .NET 10', role: '分开棋盘规则、搜索、存储与联网。' },
      { name: 'WinForms / GDI+', role: '绘制棋盘、棋子、手数与搜索面板。' },
      { name: 'Alpha–Beta / PVS', role: '保留经典引擎，加入迭代加深与威胁排序。' },
      { name: 'Photon / JSON / SGF', role: '连接在线双人、完整棋谱与逐手回看。' },
    ],
    sections: [{
      id: 'search-and-play', title: '不同搜索，放在同一张棋盘',
      items: [
        { title: '11 种可选引擎', body: ['负极大值、Alpha–Beta、PVS、历史启发与五元组等保留独立路径；V3 威胁搜索结合迭代加深、走法排序与置换表。'] },
        { title: '思考过程可观察', body: ['同屏观察深度、节点、耗时与缓存命中。后台限时搜索返回已完成的深度；取消或重开会丢弃过期结果。'] },
      ],
    }, {
      id: 'online-opponent', title: '对局、回看与在线双人',
      items: [
        { title: '棋局可以留下来', body: ['JSON 保留对局与回看位置，SGF 交换主线棋谱；导入先校验落子与轮次，自动保存采用临时文件替换。'] },
        { title: '独立的 V3 房间', body: ['沿用 Photon Asia 服务路线，以版本与房间协议隔离旧客户端。双方交换昵称与棋盘信息，悔棋和重开由对手确认。'] },
        { title: '双端一起确认', body: ['悔棋与重开经过请求、提交或取消协商，避免迟到回复只改变一端；接收层同时校验会话、手数与落点。'] },
      ],
    }],
    footnote: '采用无禁手的连五规则。新引擎为选择性搜索，不代表完全求解或特定棋力等级；V3 与旧版不跨版本联机。',
  },
  'route-lab': {
    origin: {
      title: '把旅行商实验重新画出来',
      paragraphs: ['源于 2016 年独立开发的旅行商程序，本轮保留历史源码，重新整理现代算法内核与深色桌面界面。给同一组城市运行遗传算法和模拟退火，观察路线怎样变化、收益怎样趋缓。'],
    },
    stack: [
      { name: 'C# / .NET 10', role: '实现排列搜索、距离矩阵与可复现实验。' },
      { name: '遗传算法', role: '以选择、保序交叉、逆转变异和精英保留演化路线。' },
      { name: '模拟退火 / 2-opt', role: '按温度接受候选，分别保留当前解与全程最佳。' },
      { name: 'WinForms / GDI+', role: '编辑城市、绘制闭环路线与真实收敛曲线。' },
    ],
    sections: [{
      id: 'compare-searches', title: '让搜索过程和结果一起可见',
      items: [
        { title: '同题对照', body: ['两种算法使用同一组城市，分别显示实际耗时、评估数与最佳路线；不把一代遗传和一轮退火当成相同计算预算。'] },
        { title: '保留真正的最佳解', body: ['退火只在接受后修改当前路线，拒绝不会污染状态；全程最佳另行保存，停止也保留已经找到的路线。'] },
        { title: '可以改，也可以重现', body: ['画布支持添加、拖动与删除城市；固定场景、参数与种子复现实验，后台进度快照和取消令牌保持交互响应。'] },
      ],
    }],
    footnote: '这是启发式组合优化实验。曲线来自实际运行，最短已知路线不等于已证明的全局最优解。',
  },
  'sort-lab': {
    origin: {
      title: '让排序比较更有依据',
      paragraphs: ['源于 2016 年的个人排序算法测试工具。本轮恢复原有算法文本，把旧版动态脚本执行改为可复现的内置算法实验，重新实现测量、验证与可视化，不再依赖旧 Roslyn 和二进制对象反序列化。'],
    },
    stack: [
      { name: 'C# / .NET 10', role: '实现 8 种排序，并以 Array.Sort 作运行时对照。' },
      { name: 'Stopwatch / GC 指标', role: '测量耗时与线程累计分配，独立运行操作计数。' },
      { name: 'WinForms / GDI+', role: '呈现规模曲线、输入预览与比较表格。' },
      { name: '固定 PRNG / JSON', role: '生成同源输入并导出完整实验记录。' },
    ],
    sections: [{
      id: 'measured-comparison', title: '先保证相同，再讨论快慢',
      items: [
        { title: '分布也是实验变量', body: ['随机、近乎有序、逆序与大量重复分别比较；每种算法使用同一输入副本，多规模曲线呈现增长趋势。'] },
        { title: '计时与计数分开', body: ['预热后重复取耗时中位数，比较、交换和写入另跑一遍统计。Array.Sort 不公开内部计数，以 — 标明。'] },
        { title: '每一轮都验证', body: ['计时与计数结果均逐项对照 Array.Sort；超大二次复杂度任务明确跳过，其余内置实现定期响应取消。'] },
      ],
    }],
    footnote: '分配指标为调用区间的累计线程分配，并非峰值内存。结果会受 JIT 和运行环境影响，不将单次实验当成通用性能排名。',
  },
};

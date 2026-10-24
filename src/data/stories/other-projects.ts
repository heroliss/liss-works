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
      { name: 'IMGUI / Input System', role: '构建 HUD、居民与建造面板，连接鼠标和键盘交互。' },
      { name: 'AI Navigation', role: '连接甲板通行与设施交互位置。' },
      { name: 'SSFramework / R3 / UniTask', role: '组织响应式状态、异步任务与游戏生命周期。' },
    ],
    sections: [{
      id: 'living-simulation', title: '让世界持续运转',
      items: [
        { title: '完整行动决策', body: ['将取罐、装水、路程与交付作为完整方案；先过滤不可行行动、比较风险，再用效用评分与 Softmax 采样选择。'] },
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
      { name: 'Burst / Jobs / Entities', role: '并行推进敌人移动，顺序处理依赖先后关系的战斗步骤。' },
      { name: 'SSFramework / R3 / UniTask', role: '连接状态订阅、异步流程与资源生命周期。' },
      { name: 'UI Toolkit / uGUI / TMP', role: '构建菜单、HUD 与强化卡片，TMP 绘制场景文字。' },
    ],
    sections: [{
      id: 'battle-architecture', title: '规则与表现分层',
      items: [
        { title: '模拟负责命中', body: ['内核推进真实弹丸，以扫掠检测结算移动中的命中；特效不决定伤害。'] },
        { title: '事件驱动画面', body: ['GPU 实例化批量绘制敌人、弹丸与残骸；模拟事件触发独立特效，对象池与每帧预算控制开销。'] },
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
      { name: 'Newtonsoft.Json / SharpZipLib', role: '持久化流水线配置，压缩分包输出。' },
      { name: 'BuildPipeline', role: '连接 Bundle 与 Player 构建阶段。' },
    ],
    sections: [{
      id: 'asset-workflow', title: '把重复流程变成工具',
      items: [
        { title: '标签驱动规则', body: ['用与、或、非及括号组合资源标签，批量配置平台尺寸、压缩格式与质量。'] },
        { title: '引用关系可检查', body: ['反向依赖树回答“谁在使用它”，结合依赖根和 Bundle 清单辅助定位无用资源。'] },
        { title: '阶段可以组合', body: ['窗口与命令行共享模块配置，按需串联预处理、Bundle、分包与 Player 构建。'] },
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
        { title: '按需聚焦', body: ['横纵轴独立缩放，平移与供应商高亮聚焦局部；标签比较多个候选位置，尽量避开文字和模型点。'] },
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
      { name: 'GeoJSON / 高德瓦片', role: '组织行政边界，可选底图补充道路与地理参照。' },
      { name: 'Node.js / Mercator', role: '投影并简化 GeoJSON，生成含 SVG 路径的分省 JSON。' },
      { name: 'GitHub Pages / Actions', role: '托管静态地图并尝试定期更新。' },
    ],
    sections: [{
      id: 'progressive-map', title: '从概览进入细节',
      items: [
        { title: '渐进加载', body: ['按视口和缩放级别加载区县图层，缓存已加载省份；部分城市进一步细化到镇街。'] },
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
      { name: 'GLSL / UBO', role: '共享相机与光源参数，计算光照、阴影和后处理。' },
      { name: 'GLAD / GLFW / GLM', role: '加载 OpenGL 函数，提供窗口输入与向量矩阵运算。' },
      { name: 'Assimp / stb', role: '读取模型、纹理并导出实际帧。' },
      { name: 'ImGui', role: '同屏调整材质参数与调试显示。' },
    ],
    sections: [{
      id: 'rendering-experiments', title: '拆开一帧画面',
      items: [
        { title: '材质效果对照', body: ['同一木盒切换法线、视差遮蔽与自阴影，观察采样和光照怎样共同表达表面深度。'] },
        { title: '多光源与阴影', body: ['平行光与聚光灯使用深度图，点光源使用六面深度立方体；PCF 采样柔化阴影边缘。'] },
        { title: '离屏与后处理', body: ['场景先进入 framebuffer，再应用灰度、卷积等效果；调试面板保持独立绘制。'] },
        { title: '让数据可见', body: ['法线与深度显示辅助检查，固定预设配合真实 GPU 帧导出，便于同视角比较。'] },
      ],
    }],
  },
  'aoe4-flow': {
    origin: {
      title: '为帝国时代 4 少分一些心',
      paragraphs: ['从和朋友游戏时的自动出农需求开始，经过多轮实际使用逐渐发展成节点引擎。帝国时代 4 是默认流程与素材的中心，识别、判断和键鼠节点也支持自行扩展。'],
    },
    stack: [
      { name: 'Python / mss / pydirectinput', role: '执行节点图，连接屏幕采集与键鼠操作。' },
      { name: 'LiteGraph.js / HTML / CSS', role: 'Canvas 节点图配合原生 JavaScript，组织参数面板与调试交互。' },
      { name: 'pywebview / WebView2', role: '将网页编辑器嵌入 Windows 窗口，桥接 Python 执行引擎。' },
      { name: 'OpenCV / EasyOCR / NumPy', role: '匹配模板、识别文字，并用图像数组连接屏幕采集与判断。' },
      { name: 'JSON 流程', role: '保存节点参数与两种流的连接。' },
    ],
    sections: [{
      id: 'automation-engine', title: '从识别到可靠操作',
      items: [
        { title: '两种流分工', body: ['执行流决定顺序，数据流传递识别结果；按帧缓存让多个节点复用一次截图。'] },
        { title: '共享生产预算', body: ['按生产段依次扣减资源和人口预算，避免同一余额被多个分支重复使用。'] },
        { title: '调试与控制各就其位', body: ['在图里搜索节点、查看参数说明，用预览和断点观察分支；悬浮工具条保留生产开关与快速入口。'] },
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
      { name: 'DEAP', role: '提供适应度类型与工具箱，排序示例组合内置交叉和自定义算子。' },
    ],
    sections: [{
      id: 'program-evolution', title: '编码决定搜索空间',
      items: [
        { title: '两种基因表达', body: ['交换序列实际操作数组，函数序列读取变量并运算；通用引擎与问题评估分离。'] },
        { title: '评分与复现', body: ['排序按正确位置计分，算式按多组随机输入评估；固定种子复现演化，样例收敛不等于普遍正确。'] },
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
      { name: '.NET 10 Console', role: '输出路径矩阵与可运行边界检查。' },
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
      { name: 'Jinja2 / HTML', role: '复用服务端模板，生成文章、资料与管理页面。' },
      { name: 'Bootstrap 3 / Flask-Bootstrap', role: '提供基础页面模板，接入 CSS、jQuery 与组件脚本。' },
      { name: 'CSS / 原生 JS / Moment.js', role: 'Grid、Flex 与变量主题，原生交互及相对时间显示。' },
      { name: 'EasyMDE / DOMPurify', role: '基于 CodeMirror 编辑 Markdown，提供分屏预览与 HTML 清理。' },
      { name: 'Flask / SQLAlchemy', role: '处理请求、账号权限与内容之间的关系模型。' },
      { name: 'Flask-Login / Flask-WTF', role: '提供登录会话、表单验证与 CSRF 校验。' },
      { name: 'SQLite / Alembic', role: '持久保存内容，配合增量迁移与一致性备份。' },
      { name: 'Brevo / HTTPS API', role: '发送邮箱验证、绑定与密码找回邮件。' },
    ],
    sections: [{
      id: 'connected-web-app', title: '让内容与用户连接',
      items: [
        { title: '完整页面，按需增强', body: ['Jinja2 输出服务端页面，原生表单承担提交；写作时加载 EasyMDE，编辑器脚本不可用时仍保留文本框。'] },
        { title: '关系驱动内容', body: ['账户、角色权限、关注、文章与评论共用数据库模型，作品讨论与日常文章在同一社区连接。'] },
        { title: '预览与保存分别校验', body: ['浏览器用 DOMPurify 清理预览；服务端用 Python Markdown 与 Bleach 处理最终正文，保存为 SQLite 中的文章和评论。'] },
      ],
    }, {
      id: 'durable-accounts', title: '从访客到可找回的账号',
      items: [
        { title: '身份延续，邮箱可选', body: ['访客升级账号沿用同一个用户 ID，文章、评论与关注关系无需搬迁。邮箱可以留空，之后也能绑定或更换。'] },
        { title: '验证、绑定与密码找回', body: ['通过 Brevo HTTPS API 发送验证、绑定与找回邮件；更换邮箱需确认后生效，发信失败也保留账号与内容。'] },
        { title: '限时令牌与发送限流', body: ['ItsDangerous 为确认与找回链接生成 1 小时有效、按用途隔离的签名令牌，配合 CSRF 与发送限流；密钥保存在服务器私有配置中。'] },
      ],
    }, {
      id: 'community-administration', title: '管理有入口，操作可追溯',
      items: [
        { title: '内容可以恢复', body: ['搜索并预览文章与评论，按上下文隐藏或恢复；公开页面与计数同步更新。'] },
        { title: '更改先确认', body: ['重要操作先展示变更，再校验 CSRF 与限时单次凭证；操作记录保留时间、对象和结果。'] },
        { title: '规则持久保存', body: ['站点介绍、注册与访客发文规则随数据库保存；增量升级与一致性备份保留既有内容。'] },
      ],
    }],
  },
  gomoku: {
    origin: {
      title: '找回旧棋盘，继续做一版',
      paragraphs: ['早期独立开发的五子棋程序，围绕搜索算法与实时联机展开实践。以保留的 v2.3 工程继续做到 V3.2，让双方各自配置搜索、逐手查看统计，也让联机中的每一步都有清楚反馈。'],
    },
    stack: [
      { name: 'C# / .NET 10', role: '分开棋盘规则、搜索、双方配置与统计。' },
      { name: 'WinForms / GDI+', role: '绘制棋盘、棋子与独立设置、统计页面。' },
      { name: 'Alpha–Beta / PVS', role: 'V3 搜索结合迭代加深、Zobrist 置换表与杀手走法、历史启发。' },
      { name: 'Photon / JSON / SGF', role: '管理联机状态与双方协商，保留棋谱和回看。' },
    ],
    sections: [{
      id: 'search-and-play', title: '双方各自设置，逐手观察搜索',
      items: [
        { title: '11 种引擎，黑白独立配置', body: ['经典搜索保留独立实现，另有 V3 威胁搜索；双方分别设置引擎、深度、时间预算与评估函数。'] },
        { title: '统计随棋谱变化', body: ['按黑白查看 AI 落子次数、最近/平均/累计耗时及累计节点、缓存命中；回看只计当前手数，提示与取消不计入。'] },
        { title: '后台运行，单次单线程', body: ['每次搜索用一个后台线程展开，界面继续响应；限时返回已完成深度，取消或重开会丢弃过期结果。'] },
      ],
    }, {
      id: 'online-opponent', title: '从连接到落子，状态始终清楚',
      items: [
        { title: '自动接续，少一步前置操作', body: ['首次进入自动连接 Photon Asia；创建或加入会等待连接就绪，无需先手动进入大厅。'] },
        { title: '看清状态，也看清对手', body: ['显示当前阶段、房间人数和双方身份；悔棋、重开经请求与提交共同确认，接收层校验会话、手数和落点。'] },
        { title: '可取消、重试与返回大厅', body: ['待完成操作可取消，失败可重试；返回大厅结束联机并保留棋谱。主动断开不反复重连，也不自动续接原对局。'] },
      ],
    }],
    footnote: '采用无禁手的连五规则，搜索结果受算法、预算与机器影响。3.0、3.1、3.2 共用 liss-gomoku-v3 协议；断线后棋谱保留，原联机对局不续接。',
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
        { title: '保留真正的最佳解', body: ['用四条边的变化评估 2-opt 候选，只在接受后反转并重算路线；当前解与全程最佳分别保存。'] },
        { title: '可以改，也可以重现', body: ['画布支持添加、拖动与删除城市；固定场景、参数与种子复现实验，后台进度快照和取消令牌保持交互响应。'] },
      ],
    }],
    footnote: '这是启发式组合优化实验。曲线来自实际运行，最短已知路线不等于已证明的全局最优解。',
  },
  'sort-lab': {
    origin: {
      title: '同一输入上的算法实验',
      paragraphs: ['把核心代码编辑、实际运行和结果对照放在同一个工具中：先看算法原理，或直接改写 Sort，再用同源输入观察耗时与操作差异。'],
    },
    stack: [
      { name: 'C# / .NET 10', role: '实现 8 种排序，并以 Array.Sort 作运行时对照。' },
      { name: 'Roslyn 5.9', role: '编译核心模板，按行列反馈错误，不混入计时。' },
      { name: 'Windows Job / Worker', role: '管理独立进程，可终止不响应取消的算法。' },
      { name: 'WinForms / GDI+', role: '用横柱、双对数曲线与状态矩阵呈现实验。' },
    ],
    sections: [{
      id: 'measured-comparison', title: '改写核心，结果有据可查',
      items: [
        { title: '改动留在算法核心', body: ['模板来自真实 Sorting.cs，只露入口与必要助手；草稿和生效版分别存入本机 JSON，编译失败保留生效代码，包装可只读查看。'] },
        { title: '执行状态有明确来源', body: ['顶部状态跟随独立进程的实际执行；跳过绑定当前算法与规模，停止后保留已完成结果，不根据规模自动跳过。'] },
        { title: '增长与状态一起看', body: ['约 ×4 分档配合状态矩阵；预热后重复取中位数，计数另测，输出逐项对照 Array.Sort。'] },
      ],
    }],
    footnote: '参数上限一亿项，当前实测百万项场景。修改版只统计 SortContext API 操作，不能沿用内置复杂度或稳定性；独立进程具有当前用户权限。',
  },
};

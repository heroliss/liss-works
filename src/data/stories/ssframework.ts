import type { ProjectStory } from '../story-types';

export default {
  origin: {
    title: '多年经验的一次收束',
    paragraphs: [
      '这是我在以手工编程为主的阶段，对多年 Unity 工作经验的集中提炼。我把反复遇到的业务分层、资源清理、界面组织与工具链问题收束成框架，融合成熟第三方库，让下一款游戏少做重复的基础工作。',
    ],
  },
  stack: [
    { name: 'C# · Unity', role: '类型权限与组件、纯代码双路径' },
    { name: 'R3 · ObservableCollections', role: '响应式状态、类型事件与集合通知' },
    { name: 'UniTask', role: '异步任务、取消传递与主线程协作' },
    { name: 'YooAsset', role: '资源包加载、下载与缓存维护适配' },
    { name: 'UGUI · UI Toolkit', role: '统一窗口调度与纹理内容嵌入桥' },
    { name: 'HybridCLR', role: '热更构建、AOT 元数据与程序集装配' },
    { name: 'Luban · Protobuf', role: '配置表生成与协议序列化集成' },
  ],
  sections: [
    {
      id: 'ss-architecture',
      title: '分层与作用域',
      diagram: 'framework-architecture',
      items: [
        {
          title: '权限进入类型',
          body: ['View 经 Command 操作业务、查询只读状态；分层权限同时约束扩展方法与反射注入。'],
        },
        {
          title: 'Context 组织依赖',
          body: ['父子作用域共享服务、保留局部状态，事件各自独立；支持组件与纯 C# 两种组织方式。'],
        },
        {
          title: '状态与事件各司其职',
          body: ['Model 保留持续状态，事件表达瞬时变化；View 订阅只读状态，让规则与表现沿同一条数据流连接。'],
        },
      ],
    },
    {
      id: 'ss-lifecycle',
      title: '生命周期与资源并发',
      items: [
        {
          title: 'DisposableBag',
          body: ['统一托管订阅、资源句柄与对象归还；作用域结束后，迟到的加载结果也会回收。'],
        },
        {
          title: '等待者与物理 owner',
          body: ['取消等待不冒充操作停止；资源适配层持续观察物理终态，再释放协调权。'],
        },
        {
          title: '有序的资源维护',
          body: ['读取并行、维护独占，排队的清缓存操作不会被后续读取持续插队。'],
        },
      ],
    },
    {
      id: 'ss-ui',
      title: '同一契约，两种 UI',
      items: [
        {
          title: '双 UI 后端',
          body: ['UGUI 与 UI Toolkit 共用窗口层级、模态、返回与过渡规则；全局 Loading 用可释放句柄协调多方占用。'],
        },
        {
          title: '增量列表绑定',
          body: ['只处理集合增删、移动与替换，每行拥有独立订阅作用域；条目离开时自动退订。'],
        },
        {
          title: 'UGUI 内容嵌入桥',
          body: ['隔离相机将 UGUI 渲染为纹理，嵌入 UI Toolkit 布局并随容器裁剪；采样预算与逻辑尺寸分开。'],
        },
      ],
    },
    {
      id: 'ss-node-binding',
      title: '从 Hierarchy 到窗口代码',
      items: [
        {
          title: '绑定就显示在节点旁',
          body: ['在 Prefab 层级中选择组件、修改字段名；父节点汇总子孙绑定，折叠后也能看到结构。'],
        },
        {
          title: '生成代码与手写逻辑分开',
          body: ['节点字段与 BindNodes() 写入 .nodes.g.cs；窗口逻辑只在首次创建，重新生成保留手写内容。'],
        },
        {
          title: '配置按实际模块就近覆盖',
          body: ['工程默认、目录配置与单个 Prefab 逐字段继承；生成前能看到最终命名空间、类名与输出目录。'],
        },
      ],
    },
    {
      id: 'ss-editor',
      title: '把基础设施变得可见',
      items: [
        {
          title: '可观察的运行时',
          body: ['诊断窗口展示 Context、依赖回退与订阅；按需接入记录器，追查命令流水。'],
        },
        {
          title: '模块自登记',
          body: ['工具中心与配置中心只负责聚合导航；各模块提供自己的描述符，支持 Assets、嵌入包和 PackageCache 安装。'],
        },
        {
          title: '生成过程有发布边界',
          body: ['Luban 先写暂存目录，校验后发布代码、数据与清单，处理可观察进程异常下的回滚。'],
        },
        {
          title: '构建与启动衔接',
          body: ['热更构建先核对生成环境，再打包 DLL 与加载清单；启动时补充 AOT 元数据，按依赖顺序装配程序集。'],
        },
      ],
    },
  ],
  footnote: '自定义设计聚焦组织、生命周期与适配边界；底层能力由对应第三方库提供。',
} satisfies ProjectStory;

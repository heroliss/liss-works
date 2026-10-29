import type { GalleryImage } from './types';
import { projectImage as image } from './project-image.ts';

/** Repository-authored architecture explanation, not a runtime capture. */
export const frameworkArchitecture: GalleryImage = {
  ...image('SSFramework', 'SSFramework-architecture.png', 1448, 1086,
    '仓库提供的五层架构图：职责分层、单向调用，以及状态与事件的反向反馈。', '仓库架构图'),
  alt: 'SSFramework 架构图',
};

export interface FrameworkShowcaseItem {
  id: string;
  label: string;
  title: string;
  description: string;
  image: GalleryImage;
}

export const frameworkShowcase: FrameworkShowcaseItem[] = [
  {
    id: 'architecture', label: '架构', title: '先分清职责，再连接数据流',
    description: 'View 表达交互意图，Command 传递操作，System 执行业务规则，Model 保存状态；响应式状态和事件再把变化送回画面。',
    image: frameworkArchitecture,
  },
  {
    id: 'runtime', label: '运行', title: '在真实游戏里，追踪一次操作',
    description: 'Outpost 的实际运行快照：Context 组织作用域，BattleState 呈现场景流程，事件订阅与 Command 流水留下可追查的路径。',
    image: image('SSFramework', '03-live-services-command-trace.png', 1116, 889,
      '在 Outpost 运行时查看 Context 树、BattleState、事件订阅与 Command 流水。', '运行时诊断'),
  },
  {
    id: 'tools', label: '工具', title: '各模块有入口，基础工作有归处',
    description: '真实工具中心把资源构建、代码生成、运行诊断和开发辅助按用途归在一起；这里负责导航，具体操作仍由各自工作台完成。',
    image: image('SSFramework', '05-module-tools-center.png', 1196, 889,
      '工具中心按用途聚合构建、代码生成、诊断与开发辅助工作台。', '编辑器工具'),
  },
  {
    id: 'binding-code', label: '生成', title: '把节点关系，落成强类型代码',
    description: '自制 UI 绑定示例的真实生成结果：字段和 BindNodes() 路径写入 .nodes.g.cs，生成部分与手写窗口逻辑分开。',
    image: image('SSFramework', '17-actual-generated-binding-source.png', 1196, 689,
      '只读查看实际生成的 .nodes.g.cs：6 个强类型字段与对应的 BindNodes() 路径绑定。', '真实生成代码'),
  },
];

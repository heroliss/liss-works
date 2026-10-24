import type { ProjectStory } from '../story-types';

export const webStories: Record<string, ProjectStory> = {
  mkfun: {
    origin: {
      title: '从两个样例，得到一份转换规则',
      paragraphs: ['2016 年自学 Python 时的一次实验：能否用源与目标样例代替逐字段转换代码？如今保留原始实验，重建为可调用的 Python 工具，并用网页把映射关系展开。'],
    },
    stack: [
      { name: 'Python 3.10+ / 标准库', role: '不可变规则树负责编译、应用与路径解释，兼容旧导入名称。' },
      { name: 'HTML / CSS', role: '源样例、目标样例、新数据与结果组成响应式暗色工作台。' },
      { name: '原生 JavaScript / ES modules', role: '浏览器独立实现 JSON 子集，与 Python 共用数据夹具核对规则。' },
    ],
    sections: [
      { id: 'mkfun-rules', title: '结构重排 · 把位置关系编译下来', items: [
        { title: '叶值连接位置', body: ['目标中与源样例相同的叶值成为输入引用，其余值成为常量；编译一次，重复应用于布局相同的新数据。'] },
        { title: '键也参与映射', body: ['字典键和值共同遍历，既能交换键值，也能把矩阵或嵌套结构整理成新的形状。'] },
      ] },
      { id: 'mkfun-validation', title: '规则可解释，信息保留可检查', items: [
        { title: '结果有来源', body: ['逐项列出目标路径、输入路径与常量，布局错误、重复来源和键碰撞均有具体说明。'] },
        { title: '往返有明确边界', body: ['可选检查本次输入经正反转换后是否一致，配合深度、节点及输出规模限制处理不合要求的数据。'] },
      ] },
    ],
    footnote: '活跃核心不执行生成代码；历史 eval 实现仅作归档查看，往返成功也不代表任意数据都可逆。',
  },
  'utility-lab': {
    origin: {
      title: '把两个旧工具的用途带回浏览器',
      paragraphs: ['源于早期自写的 Unicode 字符表与汉字数字重命名工具；完整旧工程未找回，恢复的重命名入口字节码用于核对原用途，当前版本是重新设计的网页实现。'],
    },
    stack: [
      { name: 'HTML / CSS / JavaScript / Vite', role: '原生界面与相对路径静态构建，可独立部署或嵌入作品页。' },
      { name: 'Unicode UCD 17 / Web Worker', role: '随包数据在后台建索引，连接码点、名称、分类与编码表示。' },
      { name: 'BigInt / File API / File System Access', role: '纯函数转换中文数字，通过浏览器选择文件或授权目录读写。' },
      { name: 'fflate / @noble/hashes', role: '流式写入 UTF-8 ZIP，并以 SHA-256 校验文件处理与撤销。' },
    ],
    sections: [
      { id: 'utilities-unicode', title: '字符表 · 从字形看到编码', items: [
        { title: '覆盖基本与补充平面', body: ['按字符、码点或名称检索，算法命名补全 CJK 与 Hangul，组合标记和控制字符有专门显示。'] },
        { title: '不同表示互相对应', body: ['以 Unicode 标量为基础生成 UTF-8 字节、UTF-16 码元和转义形式，不把代理项当成独立字符。'] },
      ] },
      { id: 'utilities-rename', title: '文件命名 · 先确认变化，再处理文件', items: [
        { title: '规则与冲突一起预览', body: ['普通、大写和传统汉字数字按明确位值转换，同名冲突、保留名称与无效单位序列在执行前标记。'] },
        { title: '副本与目录操作分开', body: ['ZIP 模式保留原件，目录模式逐项校验后执行；支持停止、保存操作记录和按内容哈希核对撤销。'] },
      ] },
    ],
    footnote: '字符字形取决于本机字体，数据与文件处理无需后端服务；当前实现不等同于完整恢复或直接升级旧源码。',
  },
};

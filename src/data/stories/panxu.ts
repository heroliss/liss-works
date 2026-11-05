import type { ProjectStory } from '../story-types';

export default {
  origin: {
    title: 'C 盘满了，却不知道该删什么',
    paragraphs: [
      '系统自带的清理只能处理一部分缓存；陌生的大文件夹、旧安装包、重复文件和拖慢开机的启动项散落在各处，常见的清理工具又说不清楚自己删了什么。盘序把这些集中到一次体检里：先找出占空间的东西、讲清楚每一项，再由你决定，安全地清理掉。',
    ],
  },
  stack: [
    { name: 'Python · 标准库', role: '扫描、规则判断、操作记录与撤销；运行时只额外依赖 pywebview 和 psutil。' },
    { name: 'pywebview · WebView2', role: '原生窗口承载界面，界面通过 Bridge.call 调用后端，不开本地 HTTP 服务。' },
    { name: '原生 JavaScript', role: '没有构建步骤，启动时内联成一个页面。' },
    { name: '39 项内置规则', role: '识别临时文件、更新缓存、浏览器与开发工具缓存、组件存储等公认可以重建的内容。' },
    { name: 'AI 模型', role: '默认 DeepSeek，也可接 Kimi、GLM、通义千问、OpenAI、Claude、本地 Ollama 和 OpenAI 兼容接口；只负责判断。' },
    { name: 'DPAPI · Windows 接口', role: 'API Key 用 Windows 账户加密保存在本机；回收站、UAC、启动项与服务由系统接口完成。' },
  ],
  flow: {
    title: '一次体检的路径',
    steps: [
      { name: '扫描', description: '垃圾、系统盘、我的文件与重复文件。' },
      { name: '规则判断', description: '内置规则先认出常见情况。' },
      { name: 'AI 复核', description: '规则不认识的才交给模型。' },
      { name: '三组方案', description: '放心清理已勾好，其余写明依据。' },
      { name: '清理与记录', description: '分开显示释放与回收站，能撤销就撤销。' },
    ],
  },
  sections: [
    {
      id: 'panxu-score',
      title: '每一项都有分数和理由',
      items: [
        { title: '0–10 分建议清理度', body: ['8–10 分建议清理，5–7 分可以考虑，0–4 分看你需要；勾选门槛可以在设置里调整。'] },
        { title: '展开就能看到依据', body: ['绿点是支持清理的证据，琥珀色是需要注意的理由，蓝色是 AI 的话，最后一行写明为什么勾或没勾。'] },
        { title: 'AI 不能扩大范围', body: ['AI 只决定一项放在哪一组、附什么说明；没把握的、属于正在使用的程序的、最近还在改动的，都不会自动勾选。'] },
      ],
    },
    {
      id: 'panxu-safety',
      title: '删除之前，先守住边界',
      items: [
        { title: '两种删除分开', body: ['规则里的缓存和临时文件直接删除，其余默认移到回收站；放不下时如实说明哪些已经彻底删除。'] },
        { title: '受保护的位置', body: ['Windows 目录、各用户文件夹的根目录、凭据和证书目录等，用户和 AI 都删不了，包含它们的上级目录也会被拒绝。'] },
        { title: '不越界读取', body: ['不进入目录联接和符号链接，不读取 OneDrive 等云端占位文件；相关程序还开着时整项跳过。'] },
      ],
    },
    {
      id: 'panxu-history',
      title: '可追溯，也可以撤销',
      items: [
        { title: '三步写入的记录', body: ['每次操作按开始、进度、结果三步写入，中途被打断也能看出处理到了哪里。'] },
        { title: '修改可以撤回', body: ['开机项、服务和系统设置的修改，都可以从操作记录里撤销。'] },
        { title: '演练环境', body: ['--sandbox 会生成一台模拟的电脑，删除、禁用和卸载都只发生在里面，可以随时重建。'] },
      ],
    },
  ],
  footnote: 'AI 分析前会列出将要发送的内容，并把用户名等信息匿名化；不配置模型也能使用，只是没有 AI 复核和说明。截图来自演练环境。',
} satisfies ProjectStory;

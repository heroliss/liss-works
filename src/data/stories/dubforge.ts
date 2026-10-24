import type { ProjectStory } from '../story-types';

export default {
  origin: {
    title: '让好视频更容易看懂',
    paragraphs: [
      '我想把 YouTube 上值得反复观看的视频译成中文，方便自己学习，也能整理后发布到 B 站保存。DubForge 将识别、翻译、逐句校对、配音和成片集中到本机工作台，让一次制作中的反复修改与后续复用更从容。',
    ],
  },
  stack: [
    { name: 'Vue 3 · TypeScript · Vite', role: 'Vue Router 连接逐句编辑、项目空间与成片页面。' },
    { name: 'Naive UI · Pinia', role: '组合编辑面板，共享项目、导航与执行状态。' },
    { name: 'Python · FastAPI', role: 'Uvicorn 承载 ASGI 服务，Pydantic 校验请求，后台编排制作任务。' },
    { name: 'SQLModel · SQLite', role: '持久保存步骤、产物与交付回执。' },
    { name: 'FFmpeg · yt-dlp', role: '获取媒体，处理音轨、字幕与编码。' },
    { name: 'ASR · LLM · TTS', role: '接入识别、翻译与独立配音服务。' },
    { name: 'Node.js · JSONL', role: '隔离发布工作者，连接 B 站组件。' },
  ],
  flow: {
    title: '一条视频的制作路径',
    steps: [
      { name: '导入视频', description: '链接或本地文件。' },
      { name: '识别翻译', description: '保留时间与上下文。' },
      { name: '校对试听', description: '逐句选择文字与声音。' },
      { name: '组合成片', description: '独立配置多个版本。' },
      { name: '导出交付', description: '本地保存或确认投稿。' },
    ],
  },
  sections: [
    {
      id: 'dub-timeline-versions',
      title: '独立版本与剪辑',
      items: [
        { title: '独立制作方案', body: ['原声版与配音版共享素材，分别管理字幕、评论、混音、剪辑与正式结果。'] },
        { title: '剪后时间映射', body: ['删除区间按帧合并，映射源片与剪后时间，支持定位和逐帧预览。'] },
      ],
    },
    {
      id: 'dub-artifact-contract',
      title: '局部更新，稳定复用',
      items: [
        { title: '依赖与指纹', body: ['按目标解析依赖，用输入指纹复用产物；修改译文只补做受影响的声音。'] },
        { title: '主动应用模板', body: ['项目保留制作基础值；新模板先预览差异，再主动应用并保留单独覆盖。'] },
        { title: '解释更新原因', body: ['成功输入快照记录制作依据，说明参数、上游或缺失文件带来的变化。'] },
      ],
    },
    {
      id: 'dub-execution-delivery',
      title: '执行与交付可恢复',
      items: [
        { title: '冻结本轮输入', body: ['排队时可编辑，开跑后冻结设置；临时文件完成后才替换正式产物。'] },
        { title: '完成前核验', body: ['进度摘要与产物核验分开，迟到的旧响应不能覆盖新任务状态。'] },
        { title: '按回执续做', body: ['上传、原稿更新与章节分段记录；未知结果先核对，再继续未完成部分。'] },
      ],
    },
  ],
  footnote: '模型能力来自第三方；截图使用自建短片与双语稿，展示真实工作台。',
} satisfies ProjectStory;

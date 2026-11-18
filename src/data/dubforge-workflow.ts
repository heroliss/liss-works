import { projectImage } from './project-image';

const shot = (filename: string, width: number, height: number, caption: string) =>
  projectImage('dubforge', filename, width, height, caption, '隔离演示工作台');

export const dubforgeWorkflow = [
  {
    title: '获取视频',
    description: '贴入视频链接或拖进本地文件，自动建好专属项目目录，准备开始制作。',
    image: shot('v6-01-download.jpg', 1440, 900, '第 1 站 · 获取视频：支持粘贴在线链接下载或直接导入本地视频文件。'),
  },
  {
    title: '音轨分离',
    description: '把说话声和原片背景音乐干净分开——后面换上中文配音，原片的音乐和氛围依然都在。',
    image: shot('v6-02-preprocess.jpg', 1440, 900, '第 2 站 · 音轨分离：提取清晰人声用于识别，同时完整保留原片背景音轨。'),
  },
  {
    title: '语音转文字',
    description: '听出每一句话的原文和起止时间，为后续断句与双语时间轴打好底稿。',
    image: shot('v6-03-transcribe.jpg', 1440, 900, '第 3 站 · 语音转文字：本地识别外语语音与词句时间位置。'),
  },
  {
    title: '语义整理',
    description: '把零碎短词合并成自然顺畅的完整句子，避免字幕闪太快或一句话断成两截。',
    image: shot('v6-04-split.jpg', 1440, 900, '第 4 站 · 语义整理：按自然说话节奏重新断句，方便观众舒适阅读。'),
  },
  {
    title: '上下文翻译',
    description: '结合整段前后文译成地道中文，支持固定专有名词译法，告别生硬机翻腔。',
    image: shot('v6-05-translate.jpg', 1440, 900, '第 5 站 · 上下文翻译：结合前后语境与术语表生成自然流畅的中文译稿。'),
  },
  {
    title: '字幕与配音',
    description: '左看画面、右改台词，合成自然中文配音；哪句不顺耳，只重配那一句就行。',
    image: shot('v7-06-tts.png', 1024, 640, '第 6 站 · 字幕与配音（Studio v3）：收起式审查栏、原片试听与逐句双语配音同屏联动。'),
  },
  {
    title: '精选热评',
    description: '挑几条高赞外语评论一起译成中文排进画面，帮观众更快看懂原片背景梗。',
    optional: true,
    image: shot('v6-07-comments.jpg', 1440, 900, '第 7 站 · 精选热评（可选）：筛选高赞评论并译成中文，自动排布上屏节奏。'),
  },
  {
    title: '合成成片',
    description: '自由搭配双语字幕、中文配音与片段精简，一次导出原声版和配音版两套成片。',
    image: shot('v6-08-assemble.jpg', 1440, 900, '第 8 站 · 合成成片：同一项目同时管理「原声双语版」与「中文配音版」多套方案。'),
  },
  {
    title: '多平台发布',
    description: '本地 AI 生成 B 站与抖音防裁切双封面，核对草稿与章节无误后分别提交发布。',
    optional: true,
    image: shot('v7-09-delivery.png', 1024, 640, '第 9 站 · 多平台发布与交付（Studio v3）：统一衔接全自动流程与 B 站、抖音独立工作台。'),
  },
];

export const dubforgeActs = [
  { title: '从画面，到文字。', range: '01—03', steps: dubforgeWorkflow.slice(0, 3) },
  { title: '让文字，有声音。', range: '04—06', steps: dubforgeWorkflow.slice(3, 6) },
  { title: '把作品，交出去。', range: '07—09', steps: dubforgeWorkflow.slice(6, 9) },
];

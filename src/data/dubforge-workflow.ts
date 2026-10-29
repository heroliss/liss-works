import { projectImage } from './project-image';

const shot = (filename: string, caption: string) => projectImage('dubforge', filename, 1440, 900, caption, '隔离演示工作台');

export const dubforgeWorkflow = [
  { title: '获取视频', description: '从链接或本地文件开始，把视频放进项目空间。', image: shot('v6-01-download.jpg', '获取视频工作区：本地示例视频、导入资料与步骤参数。') },
  { title: '音轨分离', description: '将人声与背景分开，为识别、配音与混音准备素材。', image: shot('v6-02-preprocess.jpg', '音轨分离工作区：分离方式与人声、背景音的制作参数。') },
  { title: '语音转文字', description: '识别原文与时间位置，留下可继续整理的文本。', image: shot('v6-03-transcribe.jpg', '语音转文字工作区：识别引擎、语言与相关参数。') },
  { title: '语义整理', description: '按语义整理句子，为翻译保留上下文。', image: shot('v6-04-split.jpg', '语义整理工作区：按语义处理字幕片段的步骤参数。') },
  { title: '翻译', description: '结合上下文生成译文，再进入逐句校对。', image: shot('v6-05-translate.jpg', '翻译工作区：译文生成与语言模型相关的步骤参数。') },
  { title: '字幕与配音', description: '对照画面精修双语字幕、时间与声源，逐句试听。', image: shot('v6-06-tts.jpg', '字幕与配音工作区：自写双语稿、时间轴与逐句编辑。') },
  { title: '上屏评论', description: '选择评论、翻译内容，安排它们进入画面的方式。', optional: true, image: shot('v6-07-comments.jpg', '上屏评论工作区：评论选择、翻译与上屏方案入口。') },
  { title: '合成成片', description: '组合字幕、声音与剪辑，同一项目保留不同成片版本。', image: shot('v6-08-assemble.jpg', '合成成片工作区：原声双语版与中文配音版的版本配置。') },
  { title: '发布到 B 站', description: '检查投稿信息与分 P，将交付作为独立的一步。', optional: true, image: shot('v6-09-publish.jpg', '发布工作区：投稿目标、稿件信息与分 P 的独立交付界面。') },
];

export const dubforgeActs = [
  { title: '从画面，到文字。', range: '01—03', steps: dubforgeWorkflow.slice(0, 3) },
  { title: '让文字，有声音。', range: '04—06', steps: dubforgeWorkflow.slice(3, 6) },
  { title: '把声音，带回画面。', range: '07—09', steps: dubforgeWorkflow.slice(6, 9) },
];

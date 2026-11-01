# 海边声景：素材、许可与实现

检索、下载和主文件页/API 复核：2026-10-26。所有运行音频在本目录，本地运行不访问外部声音服务。音频默认关闭，由用户点击后才创建/恢复 AudioContext。

## 实际使用的录音

### 海浪：Beach sounds South Carolina

- 作者：**Anthropic42**（英文维基用户）。作者描述为 2003-12-25 在美国 Litchfield Beach、Pawleys Island 附近用 Sony MiniDisc 和 AudioTechnica 立体声话筒录制，从更长录音剪出。
- 主文件页及授权：[Beach sounds South Carolina](https://commons.wikimedia.org/wiki/File:Beach_sounds_South_Carolina.ogg)。作者声明将作品释放到全球公有领域，并附无条件使用的备选许可。
- 原件：`originals/beach-south-carolina.ogg`，61.58576 秒，44.1 kHz，双声道。SHA-1：`2436849497e65fc608361e24a92d289cc1027591`，与 Commons 文件 API 一致。
- 运行版：`ocean-shore.ogg`。取原录音第 5–53 秒；去除极低频、轻微限制高频/动态并调节音量，转为 48 kHz、双声道 Vorbis。不是在马尔代夫或仙本那录制，不能称作该岛现场同期录音。

### 叶片：Rustling leaves

- 作者：**Gravity Sound**。
- 主文件页：[Rustling leaves (Gravity Sound)](https://commons.wikimedia.org/wiki/File:Rustling_leaves_(Gravity_Sound).wav)。许可：[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。Commons 的原始文件页记录该许可，并链接到作者早期音效库发布和当时的授权来源；本次没有把当前不可访问的原 Drive 页面称作重新验证成功。
- 原件：`originals/rustling-leaves-gravity.wav`，18 秒，44.1 kHz，双声道，24-bit PCM。SHA-1：`7ae4603360889d3fc54c927f50c3396ada95284b`，与 Commons 文件 API 一致。
- 运行版：`leaf-rustle.ogg`。剪辑第 0.4–17.4 秒，转单声道以便空间定位，做轻微高低频处理、动态/响度整理，转为 48 kHz Vorbis。声景中另做循环和音量/频谱调制。这是树叶音效素材，并非特定岛屿棕榈树的原地录音。
- **署名行：**树叶声：Gravity Sound《Rustling leaves》，CC BY 4.0；经剪辑、循环、滤波及音量调制。标题链接到上面的 Commons 文件页，许可链接到 CC BY 4.0。

可在网页中链接同目录 [credits.html](credits.html) 展示声音署名。海浪虽不强制署名，仍保留作者与来源。

## 明示的程序声音

- 投石入水：`audio.js` 中的短瞬态、染色噪声、衰减水腔/气泡和零星滴水声组成，**不是实录**。搜索到的真实水花候选因下载限流没有接入；没有把缺失文件假称为录音。
- 很轻的空气底风：染色噪声，经带宽与实际风量控制；**不是实录**。`proceduralAir:false` 可关闭此层。主要可辨风动细节来自上面的叶片录音。
- 实录文件加载失败时会使用标记为 procedural fallback 的声音，并在 `state.warnings` / `onWarning` 明示；正常本地资产应当显示两个 `decoded.*.recorded=true`。

## 同步与空间化

录音头尾用等功率、零端点斜率的 overlap-add 交叉淡化，形成连续 AudioBuffer，再用浏览器原生循环播放。没有依赖每帧 JavaScript 准时重启循环，也没有通过静音切口遮掉循环接缝。

三组近岸 HRTF 声源随最近岸段连续移动，声道朝向跟随相机朝向；距离衰减、远处低通与较弱的立体声远海底层共同表现景别。叶片声位于树群，音量与带宽跟随传入的 **effectiveWind**。用户暂停或关闭声音时先平滑淡出，再暂停 AudioContext，恢复后渐入。

`swellEnvelope` 可由场景的近岸共享波面统计提供，控制录音的波包强弱；没有提供时，仅以共享时间的 4 秒周期作统计混音包络。固定相位不等于地形传播后的 GPU 波峰，不能称作逐浪精确同步。投石以世界坐标空间化，并加入近似 `距离 / 343 m/s` 的传播延迟。

这些是有真实录音输入的同步混音与空间听觉近似，**不是流体压力场、完整声学传播或逐浪现场重建**。没有为开放海滩添加夸张的室内混响。

## 离线生成与验收

`soundscape.renderOffline({seconds, sampleRate, wind, cameraPosition, cameraForward, swellEnvelope, splashEvents})` 使用同一套 Web Audio 节点在 OfflineAudioContext 渲染，返回 `{buffer, wav, report}`，不会开启扬声器。报告包含峰值/RMS、非有限样本数、输入录音来源/时长与混音参数。

启音后还可调用 `startCapture()`：在最终峰值保护输出并联 MediaStreamAudioDestinationNode，返回可与画布视频合并的 MediaStream；不接麦克风，不改变扬声器原路。`stopCapture()` 只断开该采集分支并结束其轨道，不关闭 AudioContext。2026-10-31 增加的总线保护位于原 compressor 之后，使用双声道联动 5 ms 预读、0.975 门限与 80 ms 释放；AudioWorklet 不可用时回退为有界软峰值曲线，状态明确区分两者。

烟花独立保留原主爆，新增五段短爆、低沉爆响与裂响素材，均已保存本地出处、许可、处理记录和哈希；见 [烟花音色库](fireworks/SOURCES.md)、[试听](../../verification/fireworks/audio-palette-review.html) 与 [本轮验收](../../verification/audio-palette/ACCEPTANCE.md)。

纯 PCM 辅助函数 `crossfadeLoopPCM`、`proceduralSplashPCM`、`audioPCMStats`、`encodeAudioWav` 也可在 Node 中运行，支持重复生成与技术 QA。响度、无削波和连续性检查不等于主观听感验收。

`verification/audio/pcm-qa.json` 的 5 项技术检查均通过：两条录音循环和程序投石均无非有限样本、无 PCM 削波，循环接缝等于原文件连续相邻样本的一步，没有人为断点；海浪循环 46.3 秒、叶声循环 15.8 秒。

实际模型不支持音频输入，因此没有把生成了试听文件冒称为主观听过。另做了本地 Vosk 小英语模型 CPU 筛查（官方 Apache 2.0 模型，仅在 verification 工具中使用）：48 秒海浪与 17 秒叶声均未检测到连贯可识别句子或置信度 ≥0.8 的词，只有异常长的低置信孤立词。结果见 `verification/audio/asr-scan.json`。这是自动英语筛查，不能证明所有语言都无人声，也不是人耳听感验收；没有据可疑噪声误识别裁剪真实环境声。

## 未采用的候选

`Ocean Waves on a Tropical Beach.ogg` 的文件页虽然标为 CC0/own work，但容器注释指向第三方曲目/溪流视频，作者信息与声明不一致，因此未下载、未接入。本项目没有仅凭文件名或 CC0 标签忽略这些具体矛盾。

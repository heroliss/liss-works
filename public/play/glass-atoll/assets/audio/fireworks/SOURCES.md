# 烟花音频原始来源与加工

- 原录音者：**richwise**；标题 **Single Firework**；[Freesound 原始发布页](https://freesound.org/people/richwise/sounds/455453/)，2019-01-01；[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)。作者说明英国 Southampton、2018 除夕、Zoom H5/自制话筒；称背景声“almost”很少，不是无底噪证明。
- 实际取得的是原站公开 **HQ MP3 preview**，地址和SHA256见 [source.json](source.json)。它不是登录下载的48kHz/32bit stereo原始WAV，不能这样宣传。保留下载字节 `single-firework-richwise-preview-hq.mp3`，未修改。
- 运行时 `burst-richwise-preview-mono.ogg` 从上述压缩预览3.572708333s起裁3.4s；左右声道等权下混、4ms入淡/300ms出淡、Vorbis quality6。没有声压校准/增益归一/AI去声。加工参数、原/派生hash、立体声相关度和技术波形见source.json及verification/fireworks/recording-technical-scan.json。
- 波形只证明主瞬态约3.605s，未证明无语音。**代理未做主观试听，声音质感/底噪仍需实际听审。** 不将未知YouTube音轨或市区欢呼底噪当纯净单爆。
- 使用已有QA用 Vosk small-en-us-0.15（Apache2.0）做了1.1s CPU英文识别筛查，结果无识别文字，见verification/fireworks/audio-asr-screen.json。可能漏掉低声/非英文/被爆声掩盖的人声，不能将此结果称为无语音证明或主观试听通过；该模型不属于运行时依赖。
- 发射与部分噼啪是程序声学合成，非实录；2026-10-31 新增独立实录裂响层。主爆载入失败亦有明确诊断的合成暂态。不可把所有声音笼统称为真实录音。

建议致谢：Single Firework — richwise / Freesound, CC0 1.0；由公开压缩预览裁切、下混与转码。CC0不强制署名，仍保留出处以便追溯。

## 2026-10-31：实录分层音色库

保留 richwise 录音资产及原压缩器参数。新增四位作者的五段运行素材，均复核 Freesound 原发布页的 **CC0 1.0**，下载的是公开 **HQ MP3 压缩预览**，不是原始 WAV。原下载字节在 originals/，完整下载地址、处理方式、原件/派生 SHA256 在 [palette-source.json](palette-source.json)；verification/fireworks/palette-provenance.mjs 可复核。

| 来源 | 作者 | 运行裁切（源时间） | 层次 |
|---|---|---|---|
| [Firecracker - Single in Ground](https://freesound.org/people/iliyabylich04/sounds/651332/) | iliyabylich04 | 0–0.38 s | 清脆短爆、子爆 |
| [Loud Firewords Bang Cut Off](https://freesound.org/people/qubodup/sounds/840510/) | qubodup | 0–1.10 s | 厚实短爆与嘶鸣、子爆 |
| [NYE Loud Booms](https://freesound.org/people/LOVEBURD/sounds/376662/) | LOVEBURD | 0.98–1.52 / 1.53–2.15 s | 两种偏低沉的爆响 |
| [Fireworks Crackle](https://freesound.org/people/16FThumaF/sounds/505264/) | 16FThumaF | 38–41.25 s | 高频分离后的远处碎裂纹理 |

统一转为 48 kHz 单声道 Vorbis q6；短爆高通 75–90 Hz/低通 14.5 kHz（qubodup 另减 2 dB），低沉爆响高通 40 Hz/低通 11 kHz、减 8 dB，裂响高通 650 Hz/低通 13 kHz、提升 2 dB。裁切末尾淡出，详见 manifest。五个新增运行文件合计 80,713 字节（约 80.7 KB），不会载入长录音预览。

2026-11-01 调整混音：由样式与 seed 稳定选择的四种短爆/低沉实录现在直接承担主声，播放速率为 0.94–1.06，分别按素材平衡增益；richwise 以速率 1、较低增益和低通滤波补充主体尾响。此前所有主爆都以高增益播放同一 richwise 主体，较轻变体容易被掩盖。较小子爆使用较轻的短录音，避免十二个子花叠成十二次同等主爆。柳、棕榈、频闪、横空银瀑和锦冠等长燃烧样式带延后实录裂响及第二段长尾；其他部分样式也带不同起点的裂响。发射及独立上升层仍明确为程序合成。所有层共用已有温度声速延迟、距离滤波、HRTF 与压缩器；同批事件先安排全部主声，24 声部上限内拥挤时跳过装饰层，暂停或静音会取消尚未响起的各层。六段录音均失效时，诊断按实际播放标明合成回退。

最终总线新增双声道联动的 5 ms 预读峰值保护，门限 0.975、释放 80 ms。低于门限时增益为 1；极近距离齐爆超过门限时才减益。录制分支连接同一最终输出。AudioWorklet 不可用时退回有界软峰值曲线，诊断明确显示 fallback；不把兼容路径声称为预读限制器。该保护是数字采样峰值控制，不是设备实际声压或插值真峰值标定。

英文 Vosk 自动筛查未识别到四个预览中的文字。波形/频段检查与语音筛查不能证明没有背景人声、音乐或瑕疵；本轮没有代理主观试听验收。录音自带的原场所尾响属于素材，不应当称为虚拟岛屿完整声学求解。

# FidelityFX FSR1 原始参考与 WebGL2 移植

原始仓库：[AMD GPUOpen FidelityFX-FSR](https://github.com/GPUOpen-Effects/FidelityFX-FSR)。本地保留文件固定到官方提交 [`a21ffb8f6c13233ba336352bdff293894c706575`](https://github.com/GPUOpen-Effects/FidelityFX-FSR/commit/a21ffb8f6c13233ba336352bdff293894c706575)，提交时间 2021-11-15；检索日期 2026-10-26。

- `ffx_fsr1.h`：未修改的官方 EASU / RCAS 源码。
- `ffx_a.h`：未修改的官方辅助类型与运算源码。
- `license.txt`：AMD MIT 许可，随移植保留。
- `source.json`：固定提交、原始 URL、文件字节数和 SHA-256。
- `../../upscaler.js`：本项目 WebGL2 float32 算法移植，包含 AMD 许可与移植说明。

## 真正实现的部分

EASU 保留官方 12 点邻域、四处双线性边缘估计、方向自适应拉伸、负叶 Lanczos2 近似核、4 个最近点的范围夹紧。WebGL2 使用 12 次 RGB `texelFetch` 代替官方 R/G/B gather 回调，数据邻域相同；不是双线性放大后添加锐化。

RCAS 保留官方 5 点十字邻域、按通道计算的最小/最大范围限制、统一负叶限制 `−0.1875`、`2^(−sharpnessStops)` 强度和可选 `FSR_RCAS_DENOISE` 路径。默认为 0.7 stops，避免把细砂/水面高频过度锐化。

本移植使用标准 float32 倒数与倒平方根，替代 AMD 的位级近似；在纯黑、纯白的除零角落显式保护分母，避免 WebGL 上的 NaN。算法结构与采样集保持一致，但不声称与 AMD 近似指令路径逐位相同，也不是 AMD 认证实现。

## 管线契约

```text
linear HDR scene → SMAA → OutputPass → 低分辨率已编码 RGB RT
                                         ↓
                                     EASU → RCAS → 全物理分辨率 canvas
```

先抗锯齿与 tone mapping，再按感知编码处理的要求见官方 [Overview / Integration PDF](FidelityFX-FSR-Overview-Integration.pdf) 第 13–14 页，AA 约束见第 32 页；输入范围与颜色要求亦见 [`ffx_fsr1.h`](https://github.com/GPUOpen-Effects/FidelityFX-FSR/blob/a21ffb8f6c13233ba336352bdff293894c706575/ffx-fsr/ffx_fsr1.h)。film grain、chromatic aberration 等引入噪声的镜头效果应放在 EASU/RCAS 之后。输入应为已 tone-map、已 sRGB 编码的 `[0,1]` 数值，但存放在 **NoColorSpace** RT 中，避免纹理硬件自动再解码。模块内部不做 tone mapping、sRGB 解码或编码，EASU 中间存储为 RGBA8 NoColorSpace，RCAS 直接输出到默认画布。

`setSize(inputW,inputH,outputW,outputH)` 的尺寸均为物理像素。画布始终保持完整 output 尺寸；动态降低的是场景/后处理 RT，不能继续缩小 canvas 再让 CSS 放大。输入和输出等大时绕过 EASU/RCAS，仅原样拷贝；调用方也可在此时直接让 OutputPass 输出到画布，省掉这一次拷贝。

该空间算法没有运动向量、历史重投影或帧生成，不能将其称为 FSR2/FSR3，也不能靠它消除全部时间走样。

## 接口与测量

```js
const upscaler = createSpatialUpscaler(THREE, renderer);
await upscaler.ready; // 启动阶段预热三个小程序，避免首次降分辨率才编译
upscaler.setSize(inputW,inputH,physicalCanvasW,physicalCanvasH);
upscaler.render(encodedInputRT); // 输出画布；不重复颜色转换
```

补充接口为 `setSharpness(stops)`、`warmup()`、`state`、`dispose()`。`state.lastCpuSubmitMs` 只是 CPU 提交耗时，**不是 GPU 时间**。模块不会嵌套 GPU timer query，以免与整帧 `EXT_disjoint_timer_query_webgl2` 冲突。

实际着色器编译、恒色/边缘测试、无双重 gamma 检查与 GPU 预算必须在真实浏览器验证。目标是在 1440×900 的完整输出上新增约 1 ms 以内；在测试前不承诺达到，也不因放进了模块就默认启用。若实际设备达不到预算，保留 native 分辨率或关闭该路径。MIT 许可不替代技术验收。

## 本机实际验收（2026-10-26）

独立、不挂 DOM 的 WebGL2 renderer 已完成实际 GPU 检查，报告见 [`verification/fsr-gpu-check.json`](../../verification/fsr-gpu-check.json)，模式图见 [`fsr-test-pattern.png`](../../verification/fsr-test-pattern.png)。结果 `passed:true`，6/6 功能检查通过：RGB 平场没有双重 gamma/tone mapping，纯黑/纯白正常，native 复制逐字节相同且方向正确，渐变与边缘输出正常；GL 与着色器错误均为 0。

在 **1080×675 → 1440×900** 的 2-pass EASU+RCAS 上，以 `EXT_disjoint_timer_query_webgl2` 测得 31 个有效样本，GPU median **0.118784 ms**、p95 **0.122864 ms**、最大 **0.129472 ms**，低于本次 1 ms 预算。编译、预热、CPU 提交没有计入这些 GPU 时间，测试使用独立 context，结束后已 dispose 并主动释放 context。

这些是本机该次测试图与尺寸上的**上采样模块耗时**，不代表整个场景帧时、所有设备或未来所有分辨率。真实场景的帧率、自动分辨率策略与 AV 验收另看整页最终报告；此处不以单点 FPS 代替该报告。

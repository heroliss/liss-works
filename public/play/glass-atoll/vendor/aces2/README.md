# Optional ACES2 numerical variant resources

Variant `aces2-ocio26-accurate-atan-v1` is explicitly non-official: the unique native atan2 is replaced with a generic range-reduced degree17 function. All other official OpenColorIO2.6.0 shader text and the two hue tables remain unchanged. Each directory retains the original function and exact inverse evidence. OCIO-LICENSE.txt applies to the OpenColorIO-derived content.

Only100/700/1270nit targets have been admitted by the frozen77-check actual GPU report. This does not make the expanded sample set an official OCIO abs-only certification or certify an HDR display. `aces2-output.js` is optional and is not enabled by these resources.

Each target contains two363x1 RGBA32F NEAREST/clamped, non-mipmapped hue tables. Their manual shader interpolation must not be replaced by hardware linear filtering. Output numeric1 means100nit before the separate unit conversion and exactly one optional sRGB encoding. No paper-white/look compensation is included.

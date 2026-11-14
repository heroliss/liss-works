// Candidate requests, not benchmark results. Main owns resource allocation and
// must report its actually committed values back to UI.setQualityState().
export const DEFAULT_QUALITY = 'medium';
export const QUALITY_IDS = Object.freeze(['low', 'balanced', 'medium', 'high', 'ultra']);
export const QUALITY_KEYS = Object.freeze([
  'dprCap', 'msaaSamples', 'shadowSize', 'shadowHz', 'waveResolution',
  'cloudSteps', 'atmosphereSteps', 'airSteps', 'airShadowTaps',
  'causticsGrid', 'causticsSize', 'causticsHz', 'reflectionScale', 'reflectionSamples',
]);
const common = Object.freeze({indirect:'low', antialias:'smaa', temporal:true, glintAA:true, opticalBloom:true});
const candidate = (label, description, values) => Object.freeze({
  label, description, candidate:true, request:Object.freeze({...common, ...values}),
});
export const QUALITY_PRESETS = Object.freeze({
  low: candidate('低', '减少像素与采样，保留完整场景。', {
    dprCap:1, msaaSamples:2, shadowSize:2048, shadowHz:30, waveResolution:256,
    cloudSteps:20, atmosphereSteps:6, airSteps:6, airShadowTaps:1,
    causticsGrid:768, causticsSize:1024, causticsHz:15, reflectionScale:.55, reflectionSamples:0,
  }),
  balanced: candidate('较低', '兼顾清晰度与开销。', {
    dprCap:1.25, msaaSamples:4, shadowSize:4096, shadowHz:30, waveResolution:256,
    cloudSteps:32, atmosphereSteps:6, airSteps:6, airShadowTaps:1,
    causticsGrid:1024, causticsSize:1024, causticsHz:20, reflectionScale:.75, reflectionSamples:0,
  }),
  medium: candidate('中', '推荐起点；可按设备继续调整。', {
    dprCap:1.65, msaaSamples:4, shadowSize:4096, shadowHz:45, waveResolution:512,
    cloudSteps:48, atmosphereSteps:8, airSteps:6, airShadowTaps:1,
    causticsGrid:1280, causticsSize:1536, causticsHz:24, reflectionScale:.75, reflectionSamples:0,
  }),
  high: candidate('高', '提高阴影、云层与水面采样。', {
    dprCap:2, msaaSamples:8, shadowSize:6144, shadowHz:60, waveResolution:512,
    cloudSteps:96, atmosphereSteps:8, airSteps:8, airShadowTaps:2,
    causticsGrid:1536, causticsSize:2048, causticsHz:30, reflectionScale:1, reflectionSamples:2,
  }),
  ultra: candidate('极高', '优先细节，复杂场景可能明显变慢。', {
    dprCap:2, msaaSamples:8, shadowSize:8192, shadowHz:60, waveResolution:1024,
    cloudSteps:128, atmosphereSteps:8, airSteps:8, airShadowTaps:2,
    causticsGrid:1536, causticsSize:2048, causticsHz:30, reflectionScale:1, reflectionSamples:2,
  }),
});

export function getQualityPreset(id = DEFAULT_QUALITY) {
  const preset = QUALITY_PRESETS[id];
  if (!preset) throw new RangeError(`Unknown quality preset: ${id}`);
  return {id, label:preset.label, description:preset.description, candidate:true, request:{...preset.request}};
}

function commonSamples(caps) {
  const raw = caps.sampleSupport ?? caps.samples;
  if (!Array.isArray(raw)) return null;
  const lists = Array.isArray(raw[0]) ? raw : [raw];
  return lists[0].filter(n => Number.isInteger(n) && n > 0 && lists.every(list => list.includes(n)));
}

/** Pure capability resolution only. No framebuffer/memory/performance guarantee.
 * caps: {maxTextureSize, sampleSupport:[[8,4,2,1],...], reflectionSampleSupport?}
 * Missing capability data leaves requests unchanged and is reported explicitly.
 */
export function resolveQualityPreset(id = DEFAULT_QUALITY, caps = {}) {
  const profile = getQualityPreset(id), effective = {...profile.request}, limits = [];
  const selectSamples = (wanted, legal, field) => {
    if (wanted === 0 || legal === null) return wanted;
    const actual = Math.max(0, ...legal.filter(n => n <= wanted));
    if (actual !== wanted) limits.push(`${field}: ${wanted} → ${actual}`);
    return actual;
  };
  const legal = commonSamples(caps);
  effective.msaaSamples = selectSamples(effective.msaaSamples, legal, 'MSAA');
  const reflectionLegal = Array.isArray(caps.reflectionSampleSupport) ? caps.reflectionSampleSupport : legal;
  effective.reflectionSamples = selectSamples(effective.reflectionSamples, reflectionLegal, 'reflection MSAA');
  if (Number.isFinite(caps.maxTextureSize) && caps.maxTextureSize >= 1) {
    for (const key of ['shadowSize', 'waveResolution', 'causticsSize']) {
      if (effective[key] > caps.maxTextureSize) {
        effective[key] = key === 'waveResolution'
          ? Math.max(1, 2 ** Math.floor(Math.log2(caps.maxTextureSize)))
          : Math.floor(caps.maxTextureSize);
        limits.push(`${key}: ${profile.request[key]} → ${effective[key]}`);
      }
    }
  }
  return {...profile, requested:id, effective, limits, capabilitiesKnown:legal !== null && Number.isFinite(caps.maxTextureSize) && caps.maxTextureSize >= 1, capabilityResolutionOnly:true};
}

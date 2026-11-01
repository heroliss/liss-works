const DEG=Math.PI/180;
export const AUTOMATIC_SHOW_DEFAULTS=Object.freeze({randomIntervals:false,intervalMinSeconds:1,intervalMaxSeconds:5,randomLaunchTilt:false,automaticTiltMinDegrees:-40,automaticTiltMaxDegrees:40});
export function validateAutomaticShow(patch={},current=AUTOMATIC_SHOW_DEFAULTS){
  const next={...AUTOMATIC_SHOW_DEFAULTS,...current,...patch},out={};
  for(const key of ['randomIntervals','randomLaunchTilt']){if(typeof next[key]!=='boolean')throw new TypeError(key+' requires a boolean');out[key]=next[key];}
  for(const key of ['intervalMinSeconds','intervalMaxSeconds']){const n=next[key];if(!Number.isFinite(n)||n<.35||n>30)throw new RangeError(key+' requires0.35..30 seconds');out[key]=n;}
  for(const key of ['automaticTiltMinDegrees','automaticTiltMaxDegrees']){const n=next[key];if(!Number.isFinite(n)||n< -65||n>65)throw new RangeError(key+' requires-65..65 degrees');out[key]=n;}
  if(out.intervalMinSeconds>out.intervalMaxSeconds)throw new RangeError('Minimum interval must not exceed maximum interval');
  if(out.automaticTiltMinDegrees>out.automaticTiltMaxDegrees)throw new RangeError('Minimum tilt must not exceed maximum tilt');
  return out;
}
export function sampleAutomaticInterval(settings,unit){
  if(!Number.isFinite(unit)||unit<0||unit>=1)throw new RangeError('Random sample requires0<=u<1');
  return settings.randomIntervals?settings.intervalMinSeconds+(settings.intervalMaxSeconds-settings.intervalMinSeconds)*unit:settings.intervalSeconds;
}
export function signedTiltAim(azimuth,signedTiltDegrees){
  if(!Number.isFinite(azimuth)||!Number.isFinite(signedTiltDegrees)||Math.abs(signedTiltDegrees)>65)throw new RangeError('Finite bearing and signed tilt within65 degrees required');
  const a=azimuth*DEG,t=signedTiltDegrees*DEG;
  return {azimuth:signedTiltDegrees<0?azimuth+180:azimuth,elevation:90-Math.abs(signedTiltDegrees),direction:[Math.sin(a)*Math.sin(t),Math.cos(t),-Math.cos(a)*Math.sin(t)],signedTiltDegrees};
}

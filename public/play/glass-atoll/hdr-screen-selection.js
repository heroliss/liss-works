// Conservative synchronous/read-only policy for matching the current browser screen.
// No browser globals, display API, permission request, native call or rendering.
import {resolveHDRCalibration} from './hdr-output.js';
const POLICY='r33-unit-scale-screen-and-contained-window-v1';
const SCREEN_KEYS=Object.freeze(['width','height','availLeft','availTop','left','top','availWidth','availHeight']);
const WINDOW_KEYS=Object.freeze(['screenX','screenY','outerWidth','outerHeight','devicePixelRatio','visualViewportScale']);
const OPTION_KEYS=Object.freeze(['deviceName','peakNits','paperWhiteNits']);
const finiteInteger=x=>Number.isSafeInteger(x)&&Math.abs(x)<=10000000;
const positiveInteger=x=>finiteInteger(x)&&x>0;
function ownData(value,keys,label){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new TypeError(label+' must be a plain own-data snapshot');
  const descriptors=Object.getOwnPropertyDescriptors(value),names=Reflect.ownKeys(descriptors);
  if(names.length>64||names.some(k=>typeof k!=='string'||(keys&&!keys.includes(k))))throw new TypeError(label+' contains unsupported fields');
  const out={};for(const key of names){const d=descriptors[key];if(!Object.hasOwn(d,'value')||!d.enumerable)throw new TypeError(label+' must not contain accessors/hidden fields');out[key]=d.value;}return out;
}
function cloneReport(report){
  const r=ownData(report,null,'native report');
  if(r.available!==true||r.platform!=='win32'||r.source!=='DXGI Output6 + DisplayConfig (read only)'||!Array.isArray(r.displays)||r.displays.length>32)throw new TypeError('Supported read-only Windows report is unavailable');
  const displays=[];for(let i=0;i<r.displays.length;i++){const entry=Object.getOwnPropertyDescriptor(r.displays,String(i));if(!entry||!Object.hasOwn(entry,'value'))throw new TypeError('Native displays must be a dense own-data array');const d=ownData(entry.value,null,'native display');if(typeof d.deviceName!=='string'||!d.deviceName||d.deviceName.length>128||typeof d.attached!=='boolean')throw new TypeError('Invalid native display identity');const bounds=d.bounds===undefined?undefined:ownData(d.bounds,['left','top','right','bottom'],'native bounds');displays.push({...d,...(bounds?{bounds}:{})});}
  const attached=displays.filter(d=>d.attached);if(attached.length===0||new Set(attached.map(d=>d.deviceName)).size!==attached.length)throw new TypeError('Native attached identities are absent or duplicated');
  return{available:true,platform:r.platform,source:r.source,displays};
}
const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
function validate(clean,observation){
  const rejected=reason=>Object.freeze({policy:POLICY,reliable:false,reason,deviceName:null,screen:null});
  let s,w;
  try{const o=ownData(observation,['screen','window'],'browser observation');s=ownData(o.screen,SCREEN_KEYS,'browser screen');w=ownData(o.window,WINDOW_KEYS,'browser window');}catch(error){return rejected('invalid-browser-snapshot: '+error.message);}
  const displays=clean.displays.filter(d=>d.attached);
  if(displays.some(d=>d.scaleFactor!==1))return rejected('unsupported-native-scale: only the current all-unit-scale hardware family is admitted');
  if(w.devicePixelRatio!==1)return rejected('unsupported-dpr-or-page-zoom: exact unit DPR required');
  if(w.visualViewportScale!==undefined&&w.visualViewportScale!==1)return rejected('visual-viewport-zoom: magnified observation rejected');
  if(!positiveInteger(s.width)||!positiveInteger(s.height)||!finiteInteger(w.screenX)||!finiteInteger(w.screenY)||!positiveInteger(w.outerWidth)||!positiveInteger(w.outerHeight))return rejected('invalid-screen-or-window-geometry');
  const fullOrigin=s.left!==undefined||s.top!==undefined;
  const left=fullOrigin?s.left:s.availLeft,top=fullOrigin?s.top:s.availTop;
  if(!finiteInteger(left)||!finiteInteger(top))return rejected('missing-complete-origin: no implicit zero origin');
  const native=displays.map(d=>({display:d,...d.bounds}));
  if(native.some(b=>!['left','top','right','bottom'].every(k=>finiteInteger(b[k]))||b.right<=b.left||b.bottom<=b.top))return rejected('invalid-native-bounds');
  for(let i=0;i<native.length;i++)for(let j=i+1;j<native.length;j++)if(overlap(native[i],native[j])>0)return rejected('overlapping-native-screens: cloned/ambiguous arrangements rejected');
  const matches=native.filter(b=>b.left===left&&b.top===top&&b.right-b.left===s.width&&b.bottom-b.top===s.height);
  if(matches.length!==1)return rejected('screen-geometry-not-unique: available work-area origin is not assumed to be full-screen origin');
  const chosen=matches[0],win={left:w.screenX,top:w.screenY,right:w.screenX+w.outerWidth,bottom:w.screenY+w.outerHeight};
  if(!finiteInteger(win.right)||!finiteInteger(win.bottom)||win.left<chosen.left||win.top<chosen.top||win.right>chosen.right||win.bottom>chosen.bottom)return rejected('window-not-contained: straddling/offscreen/origin disagreement rejected');
  if(native.some(b=>b!==chosen&&overlap(win,b)>0))return rejected('window-overlaps-another-screen');
  if(s.availLeft!==undefined&&(!finiteInteger(s.availLeft)||s.availLeft<chosen.left||s.availLeft>=chosen.right))return rejected('available-origin-inconsistent');
  if(s.availTop!==undefined&&(!finiteInteger(s.availTop)||s.availTop<chosen.top||s.availTop>=chosen.bottom))return rejected('available-origin-inconsistent');
  if(s.availWidth!==undefined&&(!positiveInteger(s.availWidth)||s.availWidth>s.width||(s.availLeft??chosen.left)+s.availWidth>chosen.right))return rejected('available-width-inconsistent');
  if(s.availHeight!==undefined&&(!positiveInteger(s.availHeight)||s.availHeight>s.height||(s.availTop??chosen.top)+s.availHeight>chosen.bottom))return rejected('available-height-inconsistent');
  return Object.freeze({policy:POLICY,reliable:true,reason:'unique-unit-scale-screen-with-fully-contained-window',deviceName:chosen.display.deviceName,screen:Object.freeze({left:chosen.left,top:chosen.top,width:s.width,height:s.height}),originSource:fullOrigin?'full-screen-left-top':'legacy-available-origin-exactly-equals-native-full-origin',window:Object.freeze({...win}),qualification:'Corroborated trusted snapshot, not authentication against a self-consistent forged browser/native report'});
}
export function validateHDRScreenObservation(report,observation){try{return validate(cloneReport(report),observation);}catch(error){return Object.freeze({policy:POLICY,reliable:false,reason:'invalid-native-report: '+error.message,deviceName:null,screen:null});}}
export function resolveObservedHDRCalibration(report,options={},observation){
  const opts=ownData(options,OPTION_KEYS,'calibration options');
  if(opts.deviceName!==undefined&&(typeof opts.deviceName!=='string'||!opts.deviceName||opts.deviceName.length>128))throw new TypeError('Explicit deviceName must be a nonempty native identity');
  for(const key of ['peakNits','paperWhiteNits'])if(opts[key]!==undefined&&(typeof opts[key]!=='number'||!Number.isFinite(opts[key])||opts[key]<=0))throw new TypeError('Manual luminance must be a positive finite number');
  let clean;try{clean=cloneReport(report);}catch{clean={available:false,displays:[]};}
  const geometry=clean.available?validate(clean,observation):Object.freeze({policy:POLICY,reliable:false,reason:'invalid-native-report',deviceName:null,screen:null});
  // Explicit device and manual luminance options remain the incumbent resolver's
  // decision. Never replace auto mode with a remembered DISPLAY identity.
  const result=resolveHDRCalibration(clean,{...opts,screen:geometry.screen,screenReliable:geometry.reliable,preferForeground:false});
  return{...result,observationSelection:geometry};
}
export const HDR_SCREEN_SELECTION_POLICY=Object.freeze({revision:POLICY,screenFields:SCREEN_KEYS,windowFields:WINDOW_KEYS,optionFields:OPTION_KEYS,foregroundFallback:false,admittedNativeScale:1,admittedDPR:1,newPermissions:false,productionEdits:false,actualGPU:false,limits:'No mixed/uniform-nonunit DPI conversion, straddling-window inference, forged-origin authentication or general HDR/display calibration support is claimed.'});

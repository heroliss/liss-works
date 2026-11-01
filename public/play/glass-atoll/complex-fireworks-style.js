// Small authored linear-RGB colour curves and smooth default burn envelopes.
// No per-frame spectrum integration, random draws or eight-bin vector optics.
const Y=v=>.2126*v[0]+.7152*v[1]+.0722*v[2];
const freeze=o=>{if(o&&typeof o==='object'&&!Object.isFrozen(o)){for(const v of Object.values(o))freeze(v);Object.freeze(o);}return o;};
const unit=v=>{const y=Y(v);if(!(y>0)||v.some(x=>!Number.isFinite(x)||x<0))throw new RangeError('Positive finite RGB required');return v.map(x=>x/y);};
export const COMPLEX_COLOURS=freeze(Object.fromEntries(Object.entries({gold:[1,.62,.08],red:[1,.035,.012],pink:[1,.10,.46],violet:[.36,.08,1],blue:[.06,.15,1],green:[.08,1,.045],silver:[1,.95,.82],amber:[1,.27,.025]}).map(([k,v])=>[k,unit(v)])));
function ordered(knots,name){if(!Array.isArray(knots)||knots.length<2||knots.length>16)throw new RangeError(name+' requires2..16 knots');for(let i=0;i<knots.length;i++)if(!Number.isFinite(knots[i].age)||knots[i].age<0||i&&knots[i].age<=knots[i-1].age)throw new RangeError(name+' clocks must increase');}
export function createComplexStyle({life,onset=0,colours=[{age:0,colour:'gold'},{age:life,colour:'gold'}],tailSeconds=.35,tailFraction=.24,tailColour='gold',tailProfile,envelopeKnots,envelopeInterpolation,pulseHz=0,pulsePhase=0}={}){
  if(!Number.isFinite(life)||life<=0||life>20||!Number.isFinite(onset)||onset<0||onset>=life)throw new RangeError('Bounded style lifetime/onset required');
  if(tailProfile!==undefined&&!['waterfall-filament-v1','sustained-comet-v1'].includes(tailProfile))throw new RangeError('Unknown complex tail profile');
  const maximumTailSeconds=tailProfile==='waterfall-filament-v1'?2.2:tailProfile==='sustained-comet-v1'?1.2:.88;
  if(!Number.isFinite(tailSeconds)||tailSeconds<0||tailSeconds>maximumTailSeconds||!Number.isFinite(tailFraction)||tailFraction<0||tailFraction>.45||!['gold','silver','source'].includes(tailColour))throw new RangeError('Bounded tail style required');
  const duration=life-onset,interpolation=envelopeInterpolation??(envelopeKnots==null?'log-smoothstep':'linear');
  if(interpolation!=='linear'&&interpolation!=='smoothstep'&&interpolation!=='log-smoothstep')throw new RangeError('Envelope interpolation requires linear, smoothstep or log-smoothstep');
  // Brief ignition, then continuous monotone decay across the burn life. Keep
  // explicit authored flashes linear unless their caller opts into smoothing.
  const sustained=tailProfile==='sustained-comet-v1'||tailProfile==='waterfall-filament-v1',decay=sustained?[[.18,.90],[.42,.64],[.60,.32],[.74,.11],[.84,.014],[.91,3e-4],[.97,3e-7]]:[[.18,.82],[.42,.5],[.60,.08],[.70,.002],[.80,2e-5],[.90,2e-7],[.96,2e-10]];
  const envelope=envelopeKnots??[{age:0,value:0},...(onset>0?[{age:onset,value:0}]:[]),{age:onset+Math.min(.04,duration*.06),value:1},...decay.map(([age,value])=>({age:onset+duration*age,value})),{age:life,value:0}];
  ordered(envelope,'Envelope');for(const k of envelope)if(!Number.isFinite(k.value)||k.value<0||k.value>1)throw new RangeError('Envelope requires0..1');
  const colourKnots=colours.map(k=>({age:k.age,rgb:Array.isArray(k.rgb)?unit(k.rgb):COMPLEX_COLOURS[k.colour]}));ordered(colourKnots,'Colour');if(colourKnots.some(k=>!k.rgb))throw new RangeError('Unknown display colour');
  const maximumRGB=[0,1,2].map(c=>Math.max(...colourKnots.map(k=>k.rgb[c]))),tailCandidates=tailColour==='source'?[...colourKnots.map(k=>k.rgb),COMPLEX_COLOURS.amber]:[COMPLEX_COLOURS[tailColour],COMPLEX_COLOURS.amber];
  return freeze({schema:'glass-atoll.complex-source-style.v1',life,onset,envelopeKnots:envelope.map(k=>({...k})),envelopeInterpolation:interpolation,...(interpolation==='log-smoothstep'?{envelopeLogValues:envelope.map(k=>k.value>0?Math.log(k.value):null)}:{}),colourKnots,maximumRGB,tailSeconds,tailFraction:tailSeconds>0?tailFraction:0,tailColour,...(tailProfile!==undefined?{tailProfile}:{}),tailMaximumRGB:[0,1,2].map(c=>Math.max(...tailCandidates.map(k=>k[c]))),pulseHz,pulsePhase,calibration:'authored linear-RGB mixture and reference I0; no measured chemistry or photometry'});
}
function interval(knots,age){let i=0;while(i<knots.length-2&&age>knots[i+1].age)i++;const a=knots[i],b=knots[i+1],u=Math.max(0,Math.min(1,(age-a.age)/(b.age-a.age)));return[a,b,u];}
export function sampleComplexEnvelope(body,age){
  const s=body.sourceStyle;if(age<0||age>=s.life)return 0;let i=0;while(i<s.envelopeKnots.length-2&&age>s.envelopeKnots[i+1].age)i++;
  const a=s.envelopeKnots[i],b=s.envelopeKnots[i+1],u=Math.max(0,Math.min(1,(age-a.age)/(b.age-a.age))),logSmooth=s.envelopeInterpolation==='log-smoothstep',t=s.envelopeInterpolation==='smoothstep'||logSmooth?u*u*(3-2*u):u;let value;
  if(logSmooth&&a.value>0&&b.value>0){const la=s.envelopeLogValues?.[i]??Math.log(a.value),lb=s.envelopeLogValues?.[i+1]??Math.log(b.value);value=u===0?a.value:u===1?b.value:Math.exp(la+(lb-la)*t);}
  else value=a.value+(b.value-a.value)*t;
  if(s.pulseHz>0){const q=(age*s.pulseHz+s.pulsePhase)%1;value*=q<.5?.35+.65*Math.sin(q*Math.PI*2):.18;}return value;
}
export function sampleComplexStyle(body,age){
  const s=body.sourceStyle,[a,b,u]=interval(s.colourKnots,age),colour=[0,1,2].map(c=>a.rgb[c]+(b.rgb[c]-a.rgb[c])*u);
  const envelope=sampleComplexEnvelope(body,age);
  return{envelope,colour,maximumColourRGB:s.maximumRGB,allPhaseMaximumRGB:s.maximumRGB.map(v=>v*body.intensity)};
}
export function sampleComplexTailStyle(body,sourceAge,lag){
  const s=body.sourceStyle,head=sampleComplexStyle(body,sourceAge),base=s.tailColour==='source'?head.colour:COMPLEX_COLOURS[s.tailColour],u=Math.min(1,Math.max(0,lag/Math.max(s.tailSeconds,1e-8)))*.7;
  return{envelope:head.envelope,colour:base.map((v,c)=>v+(COMPLEX_COLOURS.amber[c]-v)*u),maximumColourRGB:s.tailMaximumRGB,allPhaseMaximumRGB:s.tailMaximumRGB.map(v=>v*body.intensity)};
}

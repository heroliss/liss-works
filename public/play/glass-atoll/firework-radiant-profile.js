// Authored radiometric transform of the already compiled R35 geometry.
// No physics, renderer, material scheduler, camera/exposure or audio mutation.
import {createBurnProfile} from './firework-burn-profile.js';
import {THREE_HEART_SCALE_LIMITS} from './firework-scale-calibration.js';
import {RADIANT_THREE_HEART_TRAIL_RECIPE_ID,RADIANT_THREE_HEART_TRAIL_PROFILES} from './firework-trail-profile.js';
export const RADIANT_THREE_HEART_PROFILE_ID='three-heart-radiant120-v1';
export const RADIANT_THREE_HEART_LIMITS=Object.freeze({...THREE_HEART_SCALE_LIMITS,tailDurationSeconds:.88,authorGain:16});
const freeze=o=>{if(o&&typeof o==='object'&&!Object.isFrozen(o)){for(const v of Object.values(o))freeze(v);Object.freeze(o);}return o;};
export function applyRadiantThreeHeartProfile(base){
  if(!base||!Object.isFrozen(base)||base.effectProfile!=='three-heart-scale120-v1'||!Array.isArray(base.patches)||base.patches.length!==192||!base.radialScale||!Number.isFinite(base.referencePeakBudget)||base.referencePeakBudget<0)throw new RangeError('Radiant profile requires the complete immutable R35 scaled compiler result');
  const authorGain=16,effectProfile=RADIANT_THREE_HEART_PROFILE_ID,nativeReferencePeakBudget=base.referencePeakBudget,referencePeakBudget=nativeReferencePeakBudget*authorGain;
  if(!Number.isFinite(referencePeakBudget))throw new RangeError('Radiant derived reference budget must be finite');
  const radianceProfile=freeze({schema:'glass-atoll.radiant-three-heart-reference.v1',effectProfile,baseEffectProfile:'three-heart-scale120-v1',authorGain,nativeReferencePeakBudget,referencePeakBudget,normalization:'Existing native I0 already includes user intensityScale; authored gain16 applied exactly once to emission RGB and emissionReferenceI0',calibration:'authored reference brightness and optical allocation; no measured candela, nits, radiated energy or fuel calibration'});
  const ids=new Set(),patches=base.patches.map(p=>{
    if(!Number.isSafeInteger(p.id)||ids.has(p.id)||!RADIANT_THREE_HEART_TRAIL_PROFILES[p.layerId]||p.ignitionDelay!==0||!Number.isFinite(p.emissionReferenceI0)||p.emissionReferenceI0<0||!p.burnProfile)throw new RangeError('Radiant source requires each compiled R35 root and layer');ids.add(p.id);
    const derivedReferenceI0=p.emissionReferenceI0*authorGain;if(!Number.isFinite(derivedReferenceI0))throw new RangeError('Radiant body reference must be finite');
    const bodyRadianceProfile=freeze({...radianceProfile,nativeReferenceI0:p.emissionReferenceI0,derivedReferenceI0});
    const burnProfile=createBurnProfile({id:p.burnProfile.id+'/radiant16-v1',emissionKnots:p.burnProfile.emission.knots.map(k=>({age:k.age,rgb:k.rgb.map(v=>v*authorGain)})),materialRateKnots:p.burnProfile.material.knots.map(k=>({age:k.age,rate:k.rate})),metadata:{...p.burnProfile.metadata,effectProfile,radianceProfile:bodyRadianceProfile,normalization:{...p.burnProfile.metadata.normalization,policy:'native I0 times authorGain16; user intensityScale already included; no second gain',nativeReferenceI0:p.emissionReferenceI0,authorGain,derivedReferenceI0}}});
    return{...p,effectProfile,burnProfile,emissionReferenceI0:derivedReferenceI0,trailProfile:RADIANT_THREE_HEART_TRAIL_PROFILES[p.layerId],radianceProfile:bodyRadianceProfile};
  });
  return freeze({...base,effectProfile,patches,referencePeakBudget,nativeReferencePeakBudget,radianceProfile,limits:RADIANT_THREE_HEART_LIMITS,trailRecipeId:RADIANT_THREE_HEART_TRAIL_RECIPE_ID,photometry:'Authored gain16 of each R35 source reference exactly once, including all-phase RGB; user gain already included; no measured photometry. Original material and geometry retained.'});
}

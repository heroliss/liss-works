// Pure exact layout planning. No renderer, state, optical approximation or GPU.
// Complete ordered row identity and each original 64-packet sum are preserved.
import {planSmokeTransmission} from './pyro-smoke-transmission-pack.js';

export const SMOKE_TRANSMISSION_LAYOUT_SCHEMA='glass-atoll.smoke-transmission-layout.v1';
export const SMOKE_TRANSMISSION_LAYOUT_MODES=Object.freeze(['active-count','legacy-max']);
const TILE_PACKETS=64;
function freeze(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const item of Object.values(value))freeze(item);
    Object.freeze(value);
  }
  return value;
}
function textureLayout(logicalCapacity){
  const width=Math.min(256,2**Math.ceil(Math.log2(Math.max(1,logicalCapacity))));
  const height=Math.ceil(Math.max(1,logicalCapacity)/width);
  return{width,height,logicalCapacity,texelCapacity:width*height};
}
function rectangle(layout,domainTexels,validTexels,{full=false}={}){
  const height=full?layout.height:domainTexels?Math.ceil(domainTexels/layout.width):0;
  const rasterTexels=layout.width*height;
  if(domainTexels>layout.texelCapacity||validTexels>rasterTexels)throw new RangeError('Transmission layout allocation envelope violated');
  return{x:0,y:0,width:layout.width,height,rasterTexels,paddingTexels:rasterTexels-validTexels};
}

/** Exact allocation proof for every supported count/packet pair:
 * Ns*ceil(Np/64) <= maxSources*ceil(maxPackets/64), and
 * Ns*ceil(Np/64) <= ceil(min(maxPairs,maxSources*maxPackets)/64)+maxSources.
 * Choose their minimum. Texture end-row padding is accounted for separately.
 *
 * `legacy-max` is a QA layout comparator: positive work retains the previous
 * maximum-source stride/partial allocation and full output rectangle. Empty
 * requests in both modes use one full neutral output pass, preserving the old
 * pixel contract without claiming old two-pass dispatch identity.
 */
export function planSmokeTransmissionLayout(count,packets,{
  maxSources=64,maxPackets=48,maxPairs=3072,maxRequestPairs=null,layoutMode='active-count'
}={}){
  if(!SMOKE_TRANSMISSION_LAYOUT_MODES.includes(layoutMode))throw new RangeError('Transmission layoutMode requires active-count or legacy-max');
  // Keep the legacy maxPairs constructor contract; larger complete requests are explicit.
  const plan=planSmokeTransmission(count,packets,{maxSources,maxPackets,maxPairs,maxRequestPairs});
  if(!plan.supported)return freeze({schema:SMOKE_TRANSMISSION_LAYOUT_SCHEMA,...plan,layoutMode,action:'reject',allocation:null,mapRequired:false,reduceRequired:false,reduceTileCount:0,freshGenerationRequired:true,publishAfter:'never'});

  if(layoutMode==='legacy-max'&&plan.maxPairs>1048576)throw new RangeError('legacy-max comparator retains the incumbent complete-request ceiling');
  const rectangular=maxSources*Math.ceil(maxPackets/TILE_PACKETS);
  const pairEnvelope=Math.ceil(Math.min(plan.maxPairs,maxSources*maxPackets)/TILE_PACKETS)+maxSources;
  const compactCapacity=Math.min(rectangular,pairEnvelope);
  const partialCapacityTexels=layoutMode==='active-count'?compactCapacity:rectangular;
  const allocation={packet:textureLayout(maxPackets*4),source:textureLayout(maxSources*3),partial:textureLayout(partialCapacityTexels),output:textureLayout(maxSources)};
  const neutral=count===0||packets===0;
  const partialStride=layoutMode==='active-count'?Math.max(1,count):maxSources;
  const activePartialTexels=count*plan.tileCount;
  const mapDomainTexels=neutral?0:partialStride*plan.tileCount;
  if(activePartialTexels>partialCapacityTexels||mapDomainTexels>partialCapacityTexels)throw new RangeError('Transmission compact partial envelope violated');
  const mapDraw=rectangle(allocation.partial,mapDomainTexels,neutral?0:activePartialTexels);
  const fullOutputWrite=neutral||layoutMode==='legacy-max';
  const outputDraw=rectangle(allocation.output,count,count,{full:fullOutputWrite});

  return freeze({schema:SMOKE_TRANSMISSION_LAYOUT_SCHEMA,...plan,layoutMode,action:neutral?'neutral':'map-reduce',allocation,partialCapacityTexels,partialCapacityBound:{rectangular,pairEnvelope,compactCapacity},partialStride,activePartialTexels,mapDomainTexels,mapDraw,outputDraw,mapRequired:!neutral,reduceRequired:true,reduceTileCount:neutral?0:plan.tileCount,neutralOutput:neutral,fullOutputWrite,validOutputCount:count,outsideCountMayBeStale:!fullOutputWrite&&allocation.output.texelCapacity>count,freshGenerationRequired:true,publishAfter:neutral?'completed-neutral-output-pass':'completed-map-and-reduction',publication:{orderedCount:count,inactiveRowsNeutral:true,neutralRGB:[1,1,1],allAllocatedOutputsNeutral:neutral,validReadExtent:'metadata.count only',staleGenerationAllowed:false,partialResultAllowed:false},limits:['Exact numerical layout only: no packet/source reduction, implicit pair allowance or frame-time admission.','For nonempty active-count output, texels beyond metadata.count may retain old values and are not valid reads.','Zero count or zero density requires one fresh full allocated neutral-output pass; no previous texture may substitute for that pass.']});
}

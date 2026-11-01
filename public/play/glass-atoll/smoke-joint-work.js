// Pure complete-epoch numerical work accounting. No renderer or publication.
import {planSmokeTransmissionLayout} from './smoke-transmission-layout.js';
import {planTransmissionRectangles} from './smoke-transmission-rectangles.js';
import {planSmokeLightTiles} from './pyro-smoke-light-tiles.js';
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
const integer=(v,name,max)=>{if(!Number.isSafeInteger(v)||v<0||v>max)throw new RangeError(name+' requires bounded nonnegative integer');return v;};
const boolean=(v,name)=>{if(typeof v!=='boolean')throw new TypeError(name+' requires boolean');return v;};
// Diagnostic complete count when a production planner refuses its map cap.
// This is the same aligned full-row grouping/tail geometry, without enumeration.
function requiredMaps(cells,width,maxMapPairs){const cap=Math.floor(maxMapPairs/64),rows=Math.floor(cells/width),tail=cells%width;return cap>=width?Math.ceil(rows/Math.floor(cap/width))+(tail?1:0):rows*Math.ceil(width/cap)+Math.ceil(tail/cap);}

export function planJointSmokeWork({packetCount,mainCount,mainActiveRayCount,reflectionCount,reflectionActiveRayCount,ledgerCount,lightingEnabled},{maxRequestPairs=12000000,maxMapPairs=1000000,maxMapDraws=16}={}){
  const counts={packetCount:integer(packetCount,'packetCount',4096),mainCount:integer(mainCount,'mainCount',18000),mainActiveRayCount:integer(mainActiveRayCount,'mainActiveRayCount',mainCount),reflectionCount:integer(reflectionCount,'reflectionCount',18000),reflectionActiveRayCount:integer(reflectionActiveRayCount,'reflectionActiveRayCount',reflectionCount),ledgerCount:integer(ledgerCount,'ledgerCount',14000),lightingEnabled:boolean(lightingEnabled,'lightingEnabled')};
  const Tcaps={maxSources:18000,maxPackets:4096,maxPairs:1048576,maxRequestPairs},SHcaps={maxPackets:4096,maxSources:14000,maxBakePairs:1048576,maxRequestPairs,maxMapPairs,maxMapDraws};
  const allocation=planSmokeTransmissionLayout(0,0,Tcaps),lightAllocation=planSmokeLightTiles(0,0,SHcaps); // Validate even a fully inactive epoch.
  const width=allocation.allocation.partial.width,reasons=[];
  function reason(job,name,required,cap){reasons.push({job,reason:name,required,cap});}
  function capReasons(job,pairs,maps){if(pairs>maxRequestPairs)reason(job,'pair-work-capacity',pairs,maxRequestPairs);if(maps>maxMapDraws)reason(job,'map-draw-capacity',maps,maxMapDraws);}
  function sourceJob(name,count,active){
    const enabled=packetCount>0&&active>0,requiredPairs=packetCount*count;
    if(!enabled)return{name,kind:'SourceT',enabled:false,sourceCount:count,activeRayCount:active,packetCount,requiredPairs,logicalPairs:0,conservativeSlots:0,partialCells:0,mapDraws:0,draws:0,supported:true,reason:'not-required'};
    const layout=planSmokeTransmissionLayout(count,packetCount,Tcaps),map=planTransmissionRectangles({sourceCount:count,packetCount,partialWidth:width,maxMapPairs,maxDraws:maxMapDraws+1}),cells=count*Math.ceil(packetCount/64),maps=map.supported?map.mapDraws:requiredMaps(cells,width,maxMapPairs);
    capReasons(name,requiredPairs,maps);
    const supported=layout.supported&&map.supported;
    return{name,kind:'SourceT',enabled:true,sourceCount:count,activeRayCount:active,packetCount,requiredPairs,logicalPairs:requiredPairs,conservativeSlots:cells*64,partialCells:cells,mapDraws:maps,draws:maps+1,supported,reason:supported?'ready':!layout.supported?layout.reason:map.reason};
  }
  function lightJob(){
    const requiredPairs=packetCount*ledgerCount;
    if(!lightingEnabled)return{name:'SH',kind:'SH1',enabled:false,sourceCount:ledgerCount,packetCount,requiredPairs,logicalPairs:0,conservativeSlots:0,partialCells:0,mapDraws:0,draws:0,supported:true,reason:'disabled'};
    const plan=planSmokeLightTiles(packetCount,ledgerCount,SHcaps),neutral=packetCount===0||ledgerCount===0,cells=neutral?0:packetCount*Math.ceil(ledgerCount/64),maps=plan.supported?plan.mapDraws:neutral?1:requiredMaps(cells,lightAllocation.partialWidth,maxMapPairs);
    capReasons('SH',requiredPairs,maps);
    return{name:'SH',kind:'SH1',enabled:true,sourceCount:ledgerCount,packetCount,requiredPairs,logicalPairs:requiredPairs,conservativeSlots:cells*64,partialCells:cells,mapDraws:maps,draws:maps+1,neutral,supported:plan.supported,reason:plan.supported?'ready':plan.reason};
  }
  const jobs=[sourceJob('main',mainCount,mainActiveRayCount),sourceJob('reflection',reflectionCount,reflectionActiveRayCount),lightJob()],work={logicalPairs:0,conservativeSlots:0,draws:0,drawsExact:true};
  for(const j of jobs){work.logicalPairs+=j.logicalPairs;work.conservativeSlots+=j.conservativeSlots;work.draws+=j.draws;}
  for(const[key,cap]of [['logicalPairs',36000000],['conservativeSlots',40000000],['draws',51]])if(work[key]>cap)reasons.push({reason:'aggregate-'+key+'-capacity',required:work[key],cap});
  return freeze({schema:'glass-atoll.joint-smoke-work.v1',counts,policy:{maxRequestPairs,maxMapPairs,maxMapDraws},jobs,work,supported:jobs.every(j=>j.supported)&&reasons.length===0,reasons,scope:'Complete fresh numerical counts only; separate main/reflection T and one SH. No ownership, GPU admission, memory reservation, renderer, publication or full-frame performance proof.'});
}

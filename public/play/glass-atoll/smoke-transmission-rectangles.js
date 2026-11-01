// Exact global-index viewport schedule. No shader, GL or request-policy changes.
const integer=(v,n,max)=>{if(!Number.isSafeInteger(v)||v<0||v>max)throw new RangeError(n+' outside bounded integer domain');return v;};
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
const product=(a,b,n)=>integer(a*b,n,Number.MAX_SAFE_INTEGER);

// A linear interval is decomposed into a first-row tail, full-row rectangles,
// and a last-row prefix. Full rows may be grouped; partial rows never span rows.
export function decomposeTransmissionInterval({begin,end,partialWidth,maxCellsPerRect,maxRects=4095}={}){
 integer(begin,'begin',1152000);integer(end,'end',1152000);integer(partialWidth,'partialWidth',256);integer(maxCellsPerRect,'maxCellsPerRect',1152000);integer(maxRects,'maxRects',4095);
 if(end<begin||partialWidth<1||maxCellsPerRect<1)throw new RangeError('Ordered interval and positive width/cell limit required');
 const needed=end-begin,minimum=Math.ceil(needed/maxCellsPerRect);if(minimum>maxRects)return freeze({supported:false,reason:'map-draw-capacity',rects:[],requiredRectsAtLeast:minimum});
 const rects=[];let cursor=begin;
 function push(x,y,width,height){if(rects.length>=maxRects)return false;const texels=width*height,start=y*partialWidth+x;rects.push({x,y,width,height,begin:start,end:start+texels,texels});cursor+=texels;return true;}
 while(cursor<end){
  const x=cursor%partialWidth,y=Math.floor(cursor/partialWidth),remaining=end-cursor;
  let ok;if(x!==0||remaining<partialWidth||maxCellsPerRect<partialWidth)ok=push(x,y,Math.min(remaining,partialWidth-x,maxCellsPerRect),1);
  else ok=push(0,y,partialWidth,Math.min(Math.floor(remaining/partialWidth),Math.floor(maxCellsPerRect/partialWidth)));
  if(!ok)return freeze({supported:false,reason:'map-draw-capacity',rects:[],requiredRectsAtLeast:maxRects+1});
 }
 return freeze({supported:true,reason:'ready',rects,requiredRectsAtLeast:rects.length,coveredCells:needed});
}

export function planTransmissionRectangles({sourceCount,packetCount,partialWidth,partialStride=Math.max(1,sourceCount),maxMapPairs,maxDraws=64}={}){
 integer(sourceCount,'sourceCount',18000);integer(packetCount,'packetCount',4096);integer(partialStride,'partialStride',18000);integer(partialWidth,'partialWidth',256);integer(maxMapPairs,'maxMapPairs',73728000);integer(maxDraws,'maxDraws',4096);
 if(partialStride<Math.max(1,sourceCount)||partialWidth<1||maxMapPairs<1||maxDraws<1)throw new RangeError('Positive bounds and stride covering every ordered source required');
 const tileCount=Math.ceil(packetCount/64),neutral=sourceCount===0||packetCount===0,completeCells=neutral?0:product(partialStride,tileCount,'complete partial cells'),logicalPairs=product(sourceCount,packetCount,'complete logical pairs'),conservativePairs=product(completeCells,64,'complete padded64 work'),maxCellsPerMap=Math.floor(maxMapPairs/64);
 const common={schema:'glass-atoll.exact-transmission-rectangles.v1',sourceCount,packetCount,partialWidth,partialStride,tileCount,neutral,completeCells,logicalPairs,conservativePairs,maxMapPairs,maxCellsPerMap,maxDraws,reduceDraws:1,reductionReadTexels:neutral?0:sourceCount*tileCount,requiredAfterAllMaps:true,borrowedOutputPolicy:'Synchronous complete prepare; draw matching ordered view before any next prepare replaces its borrowed output',scope:'Exact viewport geometry and conservative64-slot work only; no complete-request policy, allocation, aggregate frame, GL or numerical admission'};
 if(!neutral&&maxCellsPerMap===0)return freeze({...common,supported:false,reason:'one64-slot-cell-exceeds-map-capacity',mapRects:[],mapDraws:null,totalDraws:null,coveredCells:0});
 const decomposition=decomposeTransmissionInterval({begin:0,end:completeCells,partialWidth,maxCellsPerRect:Math.max(1,maxCellsPerMap),maxRects:maxDraws-1});
 if(!decomposition.supported)return freeze({...common,supported:false,reason:decomposition.reason,requiredMapDrawsAtLeast:decomposition.requiredRectsAtLeast,mapRects:[],mapDraws:null,totalDraws:null,coveredCells:0});
 const prefixPairs=address=>{const tile=Math.floor(address/partialStride),row=address%partialStride,terms=Math.min(64,Math.max(0,packetCount-tile*64));return sourceCount*Math.min(packetCount,tile*64)+Math.min(row,sourceCount)*terms;};
 const mapRects=decomposition.rects.map((r,index)=>({...r,index,logicalPairs:prefixPairs(r.end)-prefixPairs(r.begin),conservativePairs:r.texels*64}));
 if(mapRects.reduce((n,r)=>n+r.texels,0)!==completeCells||mapRects.reduce((n,r)=>n+r.logicalPairs,0)!==logicalPairs||mapRects.some(r=>r.conservativePairs>maxMapPairs))throw new Error('Exact schedule work/coverage invariant failed');
 return freeze({...common,supported:true,reason:'ready',mapRects,mapDraws:mapRects.length,totalDraws:mapRects.length+1,coveredCells:completeCells});
}

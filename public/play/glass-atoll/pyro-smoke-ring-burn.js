// Pure authored material schedule, not chemistry or future kinematic sampling.
export const RING_BURN_PROFILE='ring-uniform-burn-v1';
export const RING_BURN_LIMITS=Object.freeze({roots:120,referenceRoots:72,admittedRootCounts:Object.freeze([72,120]),representatives:48,cellSeconds:.30,maximumRootCells:14,maximumEventPackets:684,minimumLife:3.6*.88,maximumLife:3.6*1.11});
export function ringFirstCellSeconds(bodyId){if(!Number.isSafeInteger(bodyId)||bodyId<0||bodyId>=120)throw new RangeError('Ring burn needs native root IDs0..119');return .1+.2*((Math.imul(bodyId,2654435761)+1013904223)>>>0)/2**32;}
export function createRingBurnCells({descriptor,selected,totalMass=19}={}){
  const d=descriptor,L=RING_BURN_LIMITS;if(!d||d.type!=='ring'||d.ground||!Number.isFinite(d.burstTime)||!Number.isFinite(d.endTime)||!Array.isArray(d.roots)||!L.admittedRootCounts.includes(d.roots.length)||!Array.isArray(selected)||selected.length!==L.representatives)throw new RangeError('Ring burn requires explicit72-reference or120-diagnostic roots and48 representatives');
  const rootCount=d.roots.length;
  if(!Number.isFinite(totalMass)||!(totalMass>0))throw new RangeError('Ring burn mass must be finite positive');
  const roots=new Map();for(const r of d.roots){ringFirstCellSeconds(r.id);if(r.id>=rootCount||roots.has(r.id)||r.birth!==d.burstTime||!Number.isFinite(r.life)||r.life<L.minimumLife||r.life>L.maximumLife||r.birth+r.life>=d.endTime)throw new RangeError('Ring burn native root life/clock contract changed');roots.set(r.id,r);}if(roots.size!==rootCount)throw new RangeError('Incomplete native ring IDs');
  const ids=new Set();let represented=0;for(const r of selected){if(!roots.has(r.bodyId)||ids.has(r.bodyId)||!Number.isSafeInteger(r.represented)||r.represented<1||r.total!==rootCount)throw new RangeError('Ring burn requires complete existing spatial representative weights');ids.add(r.bodyId);represented+=r.represented;}if(represented!==rootCount)throw new RangeError('Ring representative weights must cover the explicit complete root count');
  const cells=[];let assigned=0;
  for(let i=0;i<selected.length;i++){const s=selected[i],r=roots.get(s.bodyId),mass=i===selected.length-1?totalMass-assigned:totalMass*s.represented/rootCount;assigned+=mass;const first=ringFirstCellSeconds(r.id),resolution=8*Number.EPSILON*Math.max(1,Math.abs(r.birth),Math.abs(r.birth+r.life));if(resolution>1e-9)throw new RangeError('Ring burn clock precision does not support its bounded causal cells');const ages=[];
    for(let k=0;k<L.maximumRootCells;k++){const age=Math.min(r.life,first+k*L.cellSeconds);ages.push(age);if(age===r.life)break;}if(ages.at(-1)!==r.life)throw new RangeError('Ring burn cell bound exceeded');
    // A last sliver without representable GL5 interior points is repartitioned
    // with its previous cell. No mass/time is dropped, and both remain<=.30s.
    if(ages.length>1&&r.life-ages.at(-2)<=32*resolution){const start=ages.length>2?ages.at(-3):0;ages[ages.length-2]=(start+r.life)/2;}
    let startAge=0,rootAssigned=0;for(let cellIndex=0;cellIndex<ages.length;cellIndex++){const endAge=ages[cellIndex],start=r.birth+startAge,end=r.birth+endAge,width=end-start;if(!(width>32*resolution)||width>.30000001)throw new RangeError('Ring burn cell cannot provide stable past GL5 interior points');const m=cellIndex===ages.length-1?mass-rootAssigned:mass*(endAge-startAge)/r.life;if(!(m>0&&Number.isFinite(m)))throw new RangeError('Ring burn residual mass is not positive representable');rootAssigned+=m;cells.push(Object.freeze({bodyId:r.id,cellIndex,time:end,segmentStart:start,segmentEnd:end,mass:m,firstCellSeconds:first,rootLife:r.life,rootMass:mass}));startAge=endAge;}
  }
  if(cells.length>48*14)throw new RangeError('Ring burn total cell bound exceeded');return Object.freeze({profile:RING_BURN_PROFILE,cells:Object.freeze(cells),rootCount,representatives:48,totalMass,maximumCellSeconds:.30,maximumBatchDelaySeconds:.30});
}

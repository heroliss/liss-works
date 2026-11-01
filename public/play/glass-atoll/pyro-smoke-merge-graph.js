// Fixed-commit candidate graph. Caller owns immutable endpoint/time scope.
export function createSmokeMergeGraph(packets){
 const N=packets.length,nodes=packets.map((p,index)=>({p,index,order:index,alive:true,edges:new Set()})),profiles=new Map(),sources=new Map(),edges=new Map();let heaps=[[],[]];
 const compare=(a,b)=>a.score-b.score||a.a.order-b.a.order||a.b.order-b.b.order;
 const xCompare=(a,b)=>a.p.mean[0]-b.p.mean[0]||a.p.id-b.p.id;
 // Tuple keys avoid aliasing valid identifiers that contain the old delimiter.
 const sourceKey=p=>p.sourceId===null?null:JSON.stringify([p.profileId,p.sourceId]);
 function addGroup(map,key,n){if(key===null)return;let a=map.get(key);if(!a)map.set(key,a=[]);a.push(n);}
 for(const n of nodes){addGroup(profiles,n.p.profileId,n);addGroup(sources,sourceKey(n.p),n);}
 function rank(){for(const a of profiles.values())a.forEach((n,i)=>n.pr=i);for(const a of sources.values())a.forEach((n,i)=>n.sr=i);}
 for(const a of [...profiles.values(),...sources.values()])a.sort(xCompare);rank();
 function push(e){const a=heaps[e.sameSource?0:1];a.push(e);let i=a.length-1;while(i){const p=(i-1)>>>1;if(compare(a[p],e)<=0)break;a[i]=a[p];i=p;}a[i]=e;}
 function pop(h){const a=heaps[h];if(!a.length)return null;const out=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let j=i*2+1;if(j+1<a.length&&compare(a[j+1],a[j])<0)j++;if(compare(last,a[j])<=0)break;a[i]=a[j];i=j;}a[i]=last;}return out;}
 function valid(a,b){return a.alive&&b.alive&&a.p.profileId===b.p.profileId&&(Math.abs(a.pr-b.pr)<=4||(a.p.sourceId!==null&&a.p.sourceId===b.p.sourceId&&Math.abs(a.sr-b.sr)===1));}
 function remove(e){if(!e.active)return;e.active=false;edges.delete(e.key);e.a.edges.delete(e);e.b.edges.delete(e);}
 function ensure(a,b){if(a===b||!valid(a,b))return;if(a.order>b.order)[a,b]=[b,a];const key=a.order*N+b.order;if(edges.has(key))return;const p=a.p,q=b.p,distance2=p.mean.reduce((s,v,c)=>s+(v-q.mean[c])**2,0),scale=p.covariance[0]+p.covariance[4]+p.covariance[8]+q.covariance[0]+q.covariance[4]+q.covariance[8],e={key,a,b,score:distance2/scale,sameSource:p.sourceId!==null&&p.sourceId===q.sourceId,active:true};edges.set(key,e);a.edges.add(e);b.edges.add(e);push(e);}
 function neighbors(n,set){const a=profiles.get(n.p.profileId);if(a)for(let i=Math.max(0,n.pr-4);i<=Math.min(a.length-1,n.pr+4);i++)set.add(a[i]);const b=sources.get(sourceKey(n.p));if(b)for(let i=Math.max(0,n.sr-1);i<=Math.min(b.length-1,n.sr+1);i++)set.add(b[i]);}
 for(const a of sources.values())for(let i=0;i<a.length-1;i++)ensure(a[i],a[i+1]);for(const a of profiles.values())for(let i=0;i<a.length;i++)for(let j=i+1;j<Math.min(a.length,i+5);j++)ensure(a[i],a[j]);
 function insert(map,key,n){if(key===null)return;let a=map.get(key);if(!a)map.set(key,a=[]);let lo=0,hi=a.length;while(lo<hi){const m=(lo+hi)>>>1;if(xCompare(a[m],n)<=0)lo=m+1;else hi=m;}a.splice(lo,0,n);}
 function erase(map,key,n){if(key===null)return;const a=map.get(key),i=a.indexOf(n);if(i<0)throw Error('Missing graph node');a.splice(i,1);if(!a.length)map.delete(key);}
 return {
  select(){const chosen=[];for(const h of [0,1]){const list=[];while(list.length<8){const e=pop(h);if(!e)break;if(e.active&&e.a.alive&&e.b.alive)list.push(e);}for(const e of list){chosen.push({i:e.a.index,j:e.b.index,sameSource:e.sameSource,score:e.score,nodeA:e.a,nodeB:e.b,edge:e});push(e);}}return chosen;},
  merged(a,b,p){
   const affected=new Set();neighbors(a,affected);neighbors(b,affected);for(const e of [...a.edges,...b.edges])remove(e);
   erase(profiles,a.p.profileId,a);erase(profiles,b.p.profileId,b);erase(sources,sourceKey(a.p),a);erase(sources,sourceKey(b.p),b);b.alive=false;a.p=p;insert(profiles,p.profileId,a);insert(sources,sourceKey(p),a);rank();
   for(const n of [...affected])if(n.alive)neighbors(n,affected);neighbors(a,affected);
   for(const n of affected)if(n.alive){for(const e of [...n.edges])if(!valid(e.a,e.b))remove(e);const a=profiles.get(n.p.profileId);for(let i=Math.max(0,n.pr-4);i<=Math.min(a.length-1,n.pr+4);i++)ensure(n,a[i]);const b=sources.get(sourceKey(n.p));if(b)for(let i=Math.max(0,n.sr-1);i<=Math.min(b.length-1,n.sr+1);i++)ensure(n,b[i]);}
   let index=0;for(const n of nodes)if(n.alive)n.index=index++;
   if(heaps[0].length+heaps[1].length>edges.size*4+64){heaps=[[],[]];for(const e of edges.values())push(e);}
  },
  diagnostics(){return{nodes:nodes.length,live:nodes.filter(n=>n.alive).length,edges:edges.size,heapEntries:heaps[0].length+heaps[1].length};}
 };
}

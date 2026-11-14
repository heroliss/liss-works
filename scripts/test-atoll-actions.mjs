import assert from 'node:assert/strict';
import { initQuickExperience } from '../public/play/glass-atoll/ui-quick-experience.js';

// Check actual action routing and async locks without a GPU or scene simulation.
class Control {
  textContent=''; disabled=false; attributes={}; events={}; dataset={}; classes=new Set();
  classList={toggle:(name,force=!this.classes.has(name))=>(force?this.classes.add(name):this.classes.delete(name),force),contains:name=>this.classes.has(name)};
  querySelector(){return null;} // No label child: the UI falls back to the control itself.
  setAttribute(name,value){this.attributes[name]=value;}
  addEventListener(name,callback){this.events[name]=callback;}
  fire(name){return this.events[name]?.();}
}
const ids=['quick-time-status','quick-firework-type','quick-firework-description','quick-launch','quick-random','quick-auto','quick-stop','quick-firework-settings','quick-firework-status','quick-current-style','fireworks-toggle'];
const nodes=Object.fromEntries(ids.map(id=>[id,new Control()]));
const times=['day','sunset','moon','stars'].map(id=>Object.assign(new Control(),{dataset:{quickTime:id}}));
nodes['quick-firework-type'].options=[{value:'type:peony',textContent:'牡丹'},{value:'type:willow',textContent:'垂柳'}];
globalThis.document={getElementById:id=>nodes[id]||null,querySelectorAll:()=>times};
const state={paused:false,time:{preset:'day'},fireworks:{type:'peony',effectProfile:'legacy',autoLaunch:false,active:2,queued:0,smokeQuality:'light'}};
let launches=0,stops=0,notices=0,delay=null,reject=false;
const callbacks={
  onLaunchFirework(){launches++;if(reject)throw Error('fixture rejection');return delay||{accepted:true};},
  onRandomFirework(){},onFireworksChange(){},
  onStopFireworks(){stops++;state.fireworks.autoLaunch=false;state.fireworks.queued=0;},
  onQuickTimePreset(id){state.time.preset=id;return {applied:true};},
};
const api=initQuickExperience({state,callbacks,invoke:key=>callbacks[key](),submitFireworks:patch=>Object.assign(state.fireworks,patch),togglePause:()=>{state.paused=!state.paused;},openSettings(){},notify(){notices++;}});
assert.equal(nodes['quick-current-style'].textContent,'牡丹');
assert.equal(nodes['quick-launch'].attributes['aria-label'],'发射牡丹');
await nodes['quick-launch'].fire('click');assert.equal(launches,1);

let resolve;delay=new Promise(done=>{resolve=done;});
const first=nodes['quick-launch'].fire('click'),duplicate=nodes['quick-launch'].fire('click');
assert.equal(nodes['quick-launch'].disabled,true);assert.equal(launches,2);
resolve();await Promise.all([first,duplicate]);delay=null;assert.equal(nodes['quick-launch'].disabled,false);

state.fireworks.autoLaunch=true;api.syncFireworks();
assert.equal(nodes['quick-launch'].textContent,'停止后续');assert.equal(nodes['quick-launch'].classList.contains('is-stopping'),true);
await nodes['quick-launch'].fire('click');assert.equal(stops,1);assert.equal(launches,2);assert.equal(state.fireworks.active,2);
state.fireworks.queued=8;api.syncFireworks();await nodes['quick-launch'].fire('click');
assert.equal(stops,2);assert.equal(state.fireworks.queued,0);assert.equal(state.fireworks.active,2);
assert.equal(nodes['quick-launch'].textContent,'放烟花');

reject=true;const previousError=console.error;console.error=()=>{};
try{await nodes['quick-launch'].fire('click');}finally{console.error=previousError;}
assert.equal(nodes['quick-launch'].disabled,false);assert.equal(nodes['quick-launch'].attributes['aria-busy'],'false');assert.equal(notices,1);
const before=launches;await times[1].fire('click');assert.equal(state.time.preset,'sunset');assert.equal(launches,before);
assert.equal(times[1].attributes['aria-pressed'],'true');
delete globalThis.document;
console.log('Atoll action checks passed: direct launch, busy lock, automatic stop, queued stop, failure recovery, independent time selection. DOM stubs; no GPU benchmark.');

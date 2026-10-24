import {compileMapping,parseDocument} from './engine.mjs';
const el=id=>document.getElementById(id), format=value=>JSON.stringify(value,null,2);
const presets={
  profile:{from:['姓名','城市','技能'],to:{profile:{name:'姓名',city:'城市'},skills:['技能'],active:true},data:['Liss','上海','Unity'],validate:true},
  matrix:{from:[['a','b','c'],['d','e','f']],to:[['a','d'],['b','e'],['c','f']],data:[[12,24,36],[48,60,72]],validate:true},
  keys:{from:{'键甲':'值甲','键乙':'值乙'},to:{'值甲':'键甲','值乙':'键乙'},data:{Unity:'游戏开发',Python:'工具开发'},validate:true},
  loss:{from:['姓名','城市','技能'],to:{name:'姓名'},data:['Liss','上海','Unity'],validate:true}
};
let lastOutput=null;
function status(text,kind=''){el('status').textContent=text;el('status').className=`status ${kind}`;}
function run(){
  try{
    const values=['source','target','input'].map((id,i)=>{
      try{return parseDocument(el(id).value);}catch(error){throw new Error(`${['源样例','目标样例','新数据'][i]}：${error.message}`);}
    });
    const plan=compileMapping(values[0],values[1],{validate:el('validate').checked});
    const result=plan.apply(values[2]), rules=plan.explain();
    lastOutput=format(result);el('output').textContent=lastOutput;el('copy').disabled=false;
    const fragment=document.createDocumentFragment();
    rules.forEach(rule=>{
      const row=document.createElement('div');row.className='rule'+('constant' in rule?' constant':'');
      const from=document.createElement('code'),arrow=document.createElement('span'),to=document.createElement('code');
      from.textContent='constant' in rule?`常量 ${JSON.stringify(rule.constant)}`:rule.source_path;arrow.textContent='→';arrow.className='arrow';to.textContent=rule.target_path;to.className='destination';
      row.append(from,arrow,to);fragment.append(row);
    });
    el('rules').replaceChildren(fragment);el('rule-count').textContent=`${rules.length} 个目标叶`;
    status(plan.warnings.length?`已转换。${plan.warnings.join(' ')}`:`转换完成 · ${plan.sourceLeaves} 个输入叶 · ${el('validate').checked?'本次往返校验通过':'反向校验未开启'}`,plan.warnings.length?'pending':'success');
  }catch(error){
    lastOutput=null;el('copy').disabled=true;el('output').textContent='未生成结果。调整样例或数据后重新执行。';el('rules').replaceChildren();el('rule-count').textContent='';status(error.message,'error');
  }
}
function loadPreset(){const p=presets[el('preset').value];el('source').value=format(p.from);el('target').value=format(p.to);el('input').value=format(p.data);el('validate').checked=p.validate;run();}
el('preset').addEventListener('change',loadPreset);el('run').addEventListener('click',run);
['source','target','input'].forEach(id=>el(id).addEventListener('input',()=>{status('内容已修改，执行映射后更新结果。','pending');el('copy').disabled=true;lastOutput=null;}));
el('validate').addEventListener('change',run);
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();run();}});
el('copy').addEventListener('click',async()=>{
  if(lastOutput===null)return;
  try{await navigator.clipboard.writeText(lastOutput);status('结果已复制。','success');}catch{status('复制不可用。请在结果区选择文本复制。','pending');}
});
loadPreset();

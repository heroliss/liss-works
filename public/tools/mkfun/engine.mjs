/** mkfun 的 JSON 子集：独立规则树，不解释或执行输入代码。 */
const LIMITS = Object.freeze({depth: 64, nodes: 10000, chars: 200000});
const own = Object.prototype.hasOwnProperty;
const containers = new Set(['array', 'object']);

export class MappingError extends Error {}

function snapshot(value) {
  let count = 0;
  const active = new Set();
  function visit(item, depth, path) {
    if (++count > LIMITS.nodes) throw new MappingError('节点超过 10,000 个，请缩小数据。');
    if (depth > LIMITS.depth) throw new MappingError(`${path}：嵌套超过 64 层。`);
    if (item === null) return {kind:'null', value:null};
    const kind = typeof item;
    if (kind === 'string' || kind === 'boolean') return {kind, value:item};
    if (kind === 'number') {
      if (!Number.isFinite(item)) throw new MappingError(`${path}：不支持 NaN 或 Infinity。`);
      if (Number.isInteger(item) && !Number.isSafeInteger(item)) throw new MappingError(`${path}：整数超过浏览器精确范围，请用字符串表示。`);
      return {kind, value:item};
    }
    if (kind !== 'object' || (!Array.isArray(item) && ![null,Object.prototype].includes(Object.getPrototypeOf(item))))
      throw new MappingError(`${path}：只支持 JSON 数组、对象与标量。`);
    if (active.has(item)) throw new MappingError(`${path}：检测到循环引用。`);
    active.add(item);
    try {
      if (Array.isArray(item)) {
        const children=[];
        for (let i=0;i<item.length;i++) {
          if (!own.call(item,i)) throw new MappingError(`${path}[${i}]：数组不能含空槽。`);
          children.push(visit(item[i],depth+1,`${path}[${i}]`));
        }
        return {kind:'array', children};
      }
      const children=[];
      Object.keys(item).forEach((key,index)=>{
        const descriptor=Object.getOwnPropertyDescriptor(item,key);
        if (!own.call(descriptor,'value')) throw new MappingError(`${path}：对象属性必须为数据。`);
        children.push(visit(key,depth+1,`${path}<key:${index}>`));
        children.push(visit(descriptor.value,depth+1,`${path}<value:${index}>`));
      });
      return {kind:'object',children};
    } finally {active.delete(item);}
  }
  return visit(value,0,'$');
}

function entries(node,path='$',result=[]) {
  if (!containers.has(node.kind)) result.push({node,path});
  else node.children.forEach((child,i)=>entries(child,path+(node.kind==='object'?`<${i%2===0?'key':'value'}:${Math.floor(i/2)}>`:`[${i}]`),result));
  return result;
}

function checkShape(expected,actual,path='$') {
  if (containers.has(expected.kind)) {
    if (expected.kind!==actual.kind || expected.children.length!==actual.children.length)
      throw new MappingError(`${path}：新数据需要保持源样例的 ${expected.kind==='array'?'数组':'对象'} 层次与长度。`);
    expected.children.forEach((child,i)=>checkShape(child,actual.children[i],`${path}[${i}]`));
  } else if (containers.has(actual.kind)) throw new MappingError(`${path}：这里应是标量，不能替换为数组或对象。`);
}

const keyFor=node=>JSON.stringify([node.kind,node.value]);
function build(node,values,budget={size:0,cache:new Map()}) {
  if(node.kind==='ref' || !containers.has(node.kind)) {
    const value=node.kind==='ref'?values[node.index]:node.value;
    if(!budget.cache.has(value))budget.cache.set(value,JSON.stringify(value).length+4);
    budget.size+=budget.cache.get(value);
    if(budget.size>2000000)throw new MappingError('输出超过 2,000,000 字符预算，请减少重复或缩短内容。');
    return value;
  }
  const items=node.children.map(child=>build(child,values,budget));
  if (node.kind==='array') return items;
  const result=Object.create(null);
  for (let i=0;i<items.length;i+=2) {
    const key=items[i];
    if (typeof key!=='string') throw new MappingError('输出对象的键必须是字符串；Python 版另支持可哈希键。');
    if (own.call(result,key)) throw new MappingError(`输出对象键重复：${key}。请使用不同数据。`);
    Object.defineProperty(result,key,{value:items[i+1],enumerable:true,writable:true,configurable:true});
  }
  return result;
}

export function compileMapping(source,target,{validate=false}={}) {
  const src=snapshot(source), dst=snapshot(target), leaves=entries(src), indexes=new Map(), warnings=[];
  leaves.forEach(({node,path},i)=>{
    const key=keyFor(node);
    if(indexes.has(key)) warnings.push(`${path} 与 ${leaves[indexes.get(key)].path} 示例相同，匹配使用首个位置。`);
    else indexes.set(key,i);
  });
  const compile=node=>containers.has(node.kind)?{kind:node.kind,children:node.children.map(compile)}:indexes.has(keyFor(node))?{kind:'ref',index:indexes.get(keyFor(node))}:node;
  const rule=compile(dst), reverse=validate?compileMapping(target,source):null;
  function apply(input) {
    const data=snapshot(input); checkShape(src,data);
    const result=build(rule,entries(data).map(entry=>entry.node.value));
    if(reverse) {
      try {
        if(JSON.stringify(snapshot(reverse.apply(result)))!==JSON.stringify(data)) throw new MappingError('反向结果与输入不一致。');
      } catch(error) {throw new MappingError(`无法反向还原本次输入：${error.message} 该映射可能丢失信息。`);}
    }
    return result;
  }
  function explain() {
    const rows=[];
    function walk(node,path='$') {
      if(node.kind==='ref') rows.push({target_path:path,source_path:leaves[node.index].path,source_index:node.index});
      else if(containers.has(node.kind)) node.children.forEach((child,i)=>walk(child,path+(node.kind==='object'?`<${i%2===0?'key':'value'}:${Math.floor(i/2)}>`:`[${i}]`)));
      else rows.push({target_path:path,constant:node.value});
    }
    walk(rule); return rows;
  }
  return Object.freeze({apply,explain,warnings:Object.freeze(warnings),sourceLeaves:leaves.length});
}

/** 标准 JSON 解析加规模检查；不接受注释、尾逗号、函数或 Python 表达式。 */
export function parseDocument(text) {
  if(text.length>LIMITS.chars) throw new MappingError('JSON 超过 200,000 字符，请缩小输入。');
  let value;
  try {value=JSON.parse(text);} catch(error){throw new MappingError(`JSON 格式无效：${error.message}`);}
  snapshot(value);
  return value;
}

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {webcrypto} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function createEngine(){
 const elements=new Map(),listeners={},drawCalls=[],frames=new Map();let frameID=0;
 const gradient={addColorStop(){}};
 const ctx=new Proxy({drawImage:(...args)=>drawCalls.push(args),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(t,k)=>t[k]||(()=>{})});
 function element(id){if(!elements.has(id))elements.set(id,{id,width:800,height:600,style:{},dataset:{},hidden:false,isConnected:true,
  classList:{add(){},remove(){},toggle(){}},getContext:()=>ctx,querySelectorAll:()=>[],addEventListener(){},
  getBoundingClientRect:()=>({left:0,top:0,width:800,height:600}),setPointerCapture(){},value:'',textContent:'',innerHTML:''});
  return elements.get(id)}
 const local=new Map();
 const sandbox={console,structuredClone,crypto:webcrypto,performance,Math,Date,JSON,
  document:{getElementById:element,addEventListener:(name,fn)=>{listeners[name]=fn}},
  location:{protocol:'file:'},localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v)},
  requestAnimationFrame:fn=>{frames.set(++frameID,fn);return frameID},cancelAnimationFrame:id=>frames.delete(id),setTimeout:()=>0,clearTimeout(){},
  fetch:async()=>({ok:false}),prompt:()=>null};
 sandbox.window=sandbox;sandbox.addEventListener=(name,fn)=>{listeners[name]=fn};
 vm.createContext(sandbox);
 vm.runInContext(fs.readFileSync(path.join(root,'difficulty.js'),'utf8'),sandbox,{filename:'difficulty.js'});
 vm.runInContext(fs.readFileSync(path.join(root,'difficulty-catalog.js'),'utf8'),sandbox,{filename:'difficulty-catalog.js'});
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const source=html.slice(html.indexOf('<script>')+8,html.indexOf('</script>',html.indexOf('<script>'))).replace(/\r\n?/g,'\n');
 vm.runInContext(source,sandbox,{filename:'star-square-engine.js'});
 return {engine:sandbox.SquareTAS,sandbox,elements,listeners,local,drawCalls,renderFrame(now){const batch=[...frames.values()];frames.clear();for(const fn of batch)fn(now)}};
}
export {root};

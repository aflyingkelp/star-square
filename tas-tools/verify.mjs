import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createEngine,root} from './headless.mjs';
const libraryBytes=fs.readFileSync(path.join(root,'tas-library.json'),'utf8');
const library=JSON.parse(libraryBytes),{engine:catalog}=createEngine(),levels=catalog.levels();
if(library.rulesHash!==catalog.rulesHash())throw Error('Library engine hash is stale; regenerate tapes.');
if(levels.some(level=>!library.tapes[level.id]))throw Error('Missing catalog tapes: '+levels.filter(d=>!library.tapes[d.id]).map(d=>d.id).join(', '));
const reports=[];
function runTape(level,tape,mutate=false){
 const ctx=createEngine(),api=ctx.engine,before=JSON.stringify([...ctx.local.entries()]);
 api.start(level.id,tape);
 let tick=0,mutationApplied=false;
 for(const [count,original] of tape.runs){
  if(!Number.isInteger(count)||count<=0)throw Error('Invalid RLE count');
  if(!Number.isInteger(original)||original&~255)throw Error('Invalid/forbidden input mask');
  for(let i=0;i<count;i++){
   tick++;let mask=original;
   if(mutate&&tick===288){mask&=~128;mutationApplied=true}
   api.tick(mask);
  }
 }
 const st=api.state(),digest=api.digest();
 if(mutate){if(!mutationApplied||st.result?.passed)throw Error('Omega missed-frame corruption was accepted: '+level.id);api.stop();return}
 if(tick!==tape.ticks||st.tick!==tape.ticks||!st.result?.passed||st.hits!==0||st.bombs!==0||digest!==tape.digest||
   level.omega&&st.omega!==473)throw Error('Verification failed '+level.id+' '+JSON.stringify({tick,actual:st.tick,result:st.result,digest,expected:tape.digest}));
 if(JSON.stringify(st.loadout)!==JSON.stringify(tape.loadout))throw Error('Loadout mismatch '+level.id);
 api.stop();
 if(JSON.stringify([...ctx.local.entries()])!==before)throw Error('Demonstration changed persisted progress '+level.id);
 return {id:level.id,title:level.title,stars:level.stars,ticks:tick,seconds:tick/240,hits:st.hits,bombs:st.bombs,
  perfectInputs:level.omega?st.omega:0,digest,loadout:st.loadout,verified:true};
}
for(const level of levels){
 reports.push(runTape(level,library.tapes[level.id]));
 if(level.omega)runTape(level,library.tapes[level.id],true);
 console.log('PASS '+level.id+' '+(reports.at(-1).seconds).toFixed(2)+'s · 0 hits · 0 bombs'+(level.omega?' · 473/473 + rejected corrupted timing':''));
}
const report={version:1,rulesHash:library.rulesHash,librarySHA256:createHash('sha256').update(libraryBytes).digest('hex'),
 levelCount:levels.length,verifiedCount:reports.length,allPassed:true,policy:library.policy,
 checks:['Fresh game instance per tape','Actual game physics and collision rules','Earned loadout before the level rank',
 'No bomb or developer-mode inputs','Zero recorded hits','Expected clear tick and state checksum',
 'Omega 473 exact 240 Hz inputs','Omega corrupted timing cannot clear','Persistent player save unchanged'],levels:reports};
fs.writeFileSync(path.join(root,'tas-verification.json'),JSON.stringify(report,null,2));
console.log('ALL '+reports.length+' CATALOG LEVELS VERIFIED.');

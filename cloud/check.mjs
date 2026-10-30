import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import bundle from '../dist/edge/engine-source.mjs';
import {createPortableEngine} from '../tas-tools/portable.mjs';
import {makeReplayVerifier} from './replay-verifier.mjs';
const root=new URL('../',import.meta.url);
const library=JSON.parse(await fs.readFile(new URL('tas-library.json',root),'utf8'));
const server=await fs.readFile(new URL('server.js',root),'utf8');
const expectedPp=new Function('return ('+server.slice(server.indexOf('function expectedPp('),server.indexOf('function verifyRankedRun('))+')')();
const reference=createPortableEngine(bundle),levels=new Map(reference.levels().map(level=>[level.id,level]));
const verify=makeReplayVerifier('local-check-credential-not-used-in-production');
const ids=[...new Set(['entry','jack-34',Object.entries(library.tapes).sort((a,b)=>b[1].ticks-a[1].ticks)[0][0]])];
let firstScore,firstProof;
for(const id of ids){
  const tape=library.tapes[id],level=levels.get(id);
  reference.startScoreReplay(id,{...tape.loadout,seed:tape.seed});
  for(const [count,mask] of tape.runs)for(let i=0;i<count;i++)reference.tick(mask);
  const state=reference.state();assert.equal(state.result?.passed,true);
  const score={id:'check-'+id,levelId:id,rank:level.rank,stars:level.stars,passed:true,pp:expectedPp(level.stars,0,0),accuracy:100,
    score:state.score,graze:state.graze,hits:0,bombs:0,...tape.loadout,replay:{ticks:tape.ticks,runs:tape.runs,seed:tape.seed,digest:tape.digest}};
  let proof,checkpoint,count=0;
  do {
    // A fresh engine for every step proves checkpoints survive cold starts.
    proof=await verify(score,checkpoint,{scoreEngine:createPortableEngine(bundle),officialLevels:levels,expectedPp});
    assert.equal(proof.ok,true,id+' chunk '+count);checkpoint=proof.checkpoint;count++;
    if(!firstProof&&checkpoint){firstScore=score;firstProof=checkpoint;}
    assert.ok(count<650);
  }while(!proof.complete);
  console.log('PASS signed checkpoint verification',id,count,'requests');
}
assert.equal((await verify({...firstScore,pp:firstScore.pp+1},firstProof,{scoreEngine:createPortableEngine(bundle),officialLevels:levels,expectedPp})).ok,false);
assert.equal((await verify(firstScore,firstProof.slice(0,-4)+'AAAA',{scoreEngine:createPortableEngine(bundle),officialLevels:levels,expectedPp})).ok,false);
console.log('PASS altered scores and modified checkpoints rejected');

import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import bundle from '../dist/edge/engine-source.mjs';
import {createPortableEngine} from '../tas-tools/portable.mjs';
import {makeReplayVerifier} from './replay-verifier.mjs';
import {createEngine} from '../tas-tools/headless.mjs';
const root=new URL('../',import.meta.url);
const library=JSON.parse(await fs.readFile(new URL('tas-library.json',root),'utf8'));
const server=await fs.readFile(new URL('server.js',root),'utf8');
const reference=createPortableEngine(bundle),levels=new Map(reference.levels().map(level=>[level.id,level]));
const sourceGame=createEngine(),catalogByKey=new Map(sourceGame.sandbox.STAR_SQUARE_DIFFICULTY_CATALOG.map(row=>[row.key,row]));
const difficultyResults=new Map(sourceGame.engine.levels().map(level=>[level.id,catalogByKey.get(sourceGame.sandbox.SquareDifficulty.key(level))]));
const difficultyAPI=sourceGame.sandbox.SquareDifficulty;
const expectedPp=new Function('difficultyAPI','return ('+server.slice(server.indexOf('function expectedPp('),server.indexOf('function verifyRankedRun('))+')')(difficultyAPI);
const verify=makeReplayVerifier('local-check-credential-not-used-in-production');
const ids=[...new Set(['entry','jack-34',Object.entries(library.tapes).sort((a,b)=>b[1].ticks-a[1].ticks)[0][0]])];
let firstScore,firstProof;
for(const id of ids){
  const tape=library.tapes[id],level=levels.get(id);
  reference.startScoreReplay(id,{...tape.loadout,seed:tape.seed});
  for(const [count,mask] of tape.runs)for(let i=0;i<count;i++)reference.tick(mask);
  const state=reference.state();assert.equal(state.result?.passed,true);
  const difficulty=difficultyResults.get(id);
  const score={id:'check-'+id,levelId:id,rank:level.rank,stars:level.stars,passed:true,pp:expectedPp(level.stars,0,0,{},difficulty),accuracy:100,
    score:state.score,graze:state.graze,hits:0,bombs:0,...tape.loadout,replay:{ticks:tape.ticks,runs:tape.runs,seed:tape.seed,digest:tape.digest}};
  let proof,checkpoint,count=0;
  do {
    // A fresh engine for every step proves checkpoints survive cold starts.
    proof=await verify(score,checkpoint,{scoreEngine:createPortableEngine(bundle),officialLevels:levels,expectedPp,difficultyResults});
    assert.equal(proof.ok,true,id+' chunk '+count);checkpoint=proof.checkpoint;count++;
    if(!firstProof&&checkpoint){firstScore=score;firstProof=checkpoint;}
    assert.ok(count<650);
  }while(!proof.complete);
  console.log('PASS signed checkpoint verification',id,count,'requests');
}
assert.equal((await verify({...firstScore,pp:firstScore.pp+1},firstProof,{scoreEngine:createPortableEngine(bundle),officialLevels:levels,expectedPp,difficultyResults})).ok,false);
const firstDifficulty=difficultyResults.get(firstScore.levelId),dtDifficulty=difficultyAPI.afterMods(firstDifficulty,{DT:true});
const noModPP=expectedPp(firstScore.stars,0,0,{},firstDifficulty),dtPP=expectedPp(firstScore.stars,0,0,{DT:true},firstDifficulty);
assert.equal(dtPP,expectedPp(dtDifficulty.stars,0,0,{}));
assert.notEqual(dtPP,Math.round(noModPP*1.12*100)/100,'DT PP must come from adjusted difficulty, not a flat 12% bonus');
assert.equal(expectedPp(firstScore.stars,0,0,{HD:true},firstDifficulty),Math.round(noModPP*1.2*100)/100);
assert(expectedPp(firstScore.stars,0,0,{HR:true},firstDifficulty)>noModPP);
const allModsPP=expectedPp(firstScore.stars,0,0,{HD:true,DT:true,HR:true},firstDifficulty);
assert(allModsPP>dtPP&&allModsPP<Math.round(noModPP*1.5*100)/100);
assert.equal(expectedPp(firstScore.stars,0,0,{DT:true},firstDifficulty,true),Math.round(noModPP*1.12*100)/100,'previously saved DT scores remain uploadable');
assert.equal((await verify(firstScore,firstProof.slice(0,-4)+'AAAA',{scoreEngine:createPortableEngine(bundle),officialLevels:levels,expectedPp,difficultyResults})).ok,false);
console.log('PASS altered scores and modified checkpoints rejected');

import assert from 'node:assert/strict';
import {createEngine} from './headless.mjs';
const {engine}=createEngine();
const levels=engine.levels();
for(const series of ['ln4','ln7']){
 const ladder=levels.filter(level=>level.lnSeries===series);
 assert.equal(ladder.length,60);
 assert.equal(new Set(ladder.map(level=>level.id)).size,60);
 for(const index of [0,14])for(let stage=0;stage<4;stage++){
  const id=series+'-'+index+'-'+stage;
  engine.startScoreReplay(id,{seed:123,weapon:'twin',upgrades:{}});
  for(let tick=0;tick<1200;tick++)engine.tick(0);
  const first=engine.digest(),state=engine.state();assert(state.tick>0);assert(Number.isFinite(state.player.x));assert(Number.isFinite(state.player.y));
  engine.stop();engine.startScoreReplay(id,{seed:123,weapon:'twin',upgrades:{}});
  for(let tick=0;tick<1200;tick++)engine.tick(0);
  assert.equal(engine.digest(),first,id+' replay must remain deterministic');engine.stop();
 }
 console.log('PASS '+series+': 60 unique stages, first/final course simulation and deterministic replays');
}

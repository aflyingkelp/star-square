import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createEngine,root} from './headless.mjs';
const library=JSON.parse(fs.readFileSync(path.join(root,'tas-library.json'),'utf8'));
new vm.Script(fs.readFileSync(path.join(root,'tas-library.js'),'utf8'),{filename:'tas-library.js'});
console.log('PASS browser TAS library asset parses as JavaScript');
const crlfEngine=createEngine({lineEnding:'crlf'});
assert.equal(crlfEngine.engine.rulesHash(),library.rulesHash,'CRLF browser source must use the same TAS fingerprint as LF builds');
console.log('PASS TAS fingerprint is stable across LF and CRLF browser builds');
const optimized=createEngine();optimized.engine.start('ln7-0-3',{weapon:'needle',upgrades:{power:3,iframe:2}});
assert.equal(optimized.engine.state().loadout.weapon,'needle');
assert.equal(optimized.engine.state().loadout.upgrades.power,3);
assert.equal(optimized.engine.state().loadout.upgrades.iframe,2);
console.log('PASS TAS viewer accepts and restores an optimized weapon and upgrades');
const {engine:a}=createEngine(),{engine:b}=createEngine();
a.start('entry');b.start('entry');
for(let i=0;i<4;i++){a.tick(2|128);b.tick(2|128)}
const start=a.state().player.x;
for(let i=0;i<4;i++){a.tick(2);b.tick(2|128)}
assert.equal(a.state().player.dashFrames,0);
assert(b.state().player.dashFrames>0);
assert(a.state().player.x-start<b.state().player.x-start);
console.log('PASS early dash release uses normal movement immediately');
const paused=createEngine();paused.engine.start('entry');
const event={key:'Escape',code:'Escape',repeat:false,preventDefault(){}};
paused.listeners.keydown(event);assert.equal(paused.engine.state().mode,'paused');
const tick=paused.engine.state().tick;paused.engine.tick(16);assert.equal(paused.engine.state().tick,tick);
paused.listeners.keydown(event);assert.equal(paused.engine.state().mode,'play');
console.log('PASS Escape pauses and resumes the simulation');
for(const fps of [60,144,240]){
 for(const id of ['entry','jack-34']){
  const c=createEngine();c.sandbox.STAR_SQUARE_TAS_LIBRARY=library;c.engine.watch(id);
  const tape=library.tapes[id];
  assert(tape,'Missing tape '+id);
  c.elements.get('tasPause').onclick();
  const p=c.engine.state().tick;c.renderFrame(1000);c.renderFrame(2000);assert.equal(c.engine.state().tick,p);
  c.elements.get('tasStep').onclick();assert.equal(c.engine.state().tick,p+1);
  assert.equal(c.engine.replayStatus().paused,true);
  c.elements.get('tasPause').onclick();
  c.elements.get('tasSpeed').value='8';c.elements.get('tasSpeed').onchange();
  let now=2000,frames=0;
  while(!c.engine.state().result&&frames++<100000){now+=1000/fps;c.renderFrame(now)}
  assert(c.engine.replayStatus().verified,JSON.stringify({id,fps,status:c.engine.replayStatus(),state:c.engine.state().result}));
  assert.equal(c.engine.digest(),tape.digest);
  assert.equal(c.engine.state().hits,0);assert.equal(c.engine.state().bombs,0);
  if(id==='jack-34')assert.equal(c.engine.state().omega,473);
  console.log('PASS '+id+' viewer at '+fps+' Hz, pause/step/8x, verified digest');
 }
}
console.log('RUNTIME CHECKS PASSED.');

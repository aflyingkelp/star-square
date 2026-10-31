// Generate user-facing catalog data, without running or verifying TAS tapes.
import fs from 'node:fs';
import path from 'node:path';
import {createEngine,root} from './headless.mjs';
const {engine,sandbox}=createEngine(),api=sandbox.SquareDifficulty,previous=sandbox.STAR_SQUARE_DIFFICULTY_CATALOG||[];
const factory=Function('return '+sandbox.SquareStarRating.runtimeSource())();
const allDefs=engine.levels(),shardCount=Math.max(1,Number(process.env.STAR_SQUARE_DIFFICULTY_SHARDS)||1),shard=Number(process.env.STAR_SQUARE_DIFFICULTY_SHARD)||0;
const defs=allDefs.filter((_,i)=>i%shardCount===shard),results=[];
for(let i=0;i<defs.length;i++){
 const def=defs[i],old=previous[allDefs.indexOf(def)],reusable=old&&!def.lnSeries&&Number.isFinite(+old.rawStars);
 const result=reusable?{...old,version:api.VERSION,stars:+old.rawStars,key:api.key(def)}:await api.analyze(def,factory);
 results.push({...result,rawStars:Number.isFinite(+result.rawStars)?+result.rawStars:+result.stars,rank:def.rank,skill:def.skill,key:api.key(def)});
 if(results.length%10===0)console.log('Calculated '+results.length+'/'+defs.length+' map ratings');
}
if(process.env.STAR_SQUARE_DIFFICULTY_OUTPUT){
 fs.writeFileSync(process.env.STAR_SQUARE_DIFFICULTY_OUTPUT,JSON.stringify(results));
 console.log('Saved shard '+shard+' with '+results.length+' ratings');
 process.exit(0);
}
const calibration={};
for(let rank=0;rank<=34;rank++)for(const plus of [false,true]){
 const values=results.filter(r=>r.rank===rank&&!!defs.find(d=>api.key(d)===r.key)?.plus===plus).map(r=>r.rawStars).sort((a,b)=>a-b);
 if(values.length)calibration[(plus?'plus-':'')+rank]={median:values.length%2?values[(values.length-1)/2]:(values[values.length/2-1]+values[values.length/2])/2};
}
for(let i=0;i<results.length;i++)results[i]=api.calibrate(results[i],defs[i],calibration);
fs.writeFileSync(path.join(root,'difficulty-catalog.js'),'window.STAR_SQUARE_DIFFICULTY_CALIBRATION='+JSON.stringify(calibration)+';\nwindow.STAR_SQUARE_DIFFICULTY_CATALOG='+JSON.stringify(results)+';\n');
console.log('Saved '+results.length+' pattern analyses to difficulty-catalog.js');

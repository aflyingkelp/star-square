// Generate user-facing catalog data, without running or verifying TAS tapes.
import fs from 'node:fs';
import path from 'node:path';
import {createEngine,root} from './headless.mjs';
const {engine,sandbox}=createEngine(),api=sandbox.SquareDifficulty;
const factory=Function('return '+sandbox.SquareStarRating.runtimeSource())();
const defs=engine.levels(),results=[];
for(const def of defs){
 const result=await api.analyze(def,factory);
 results.push({...result,rawStars:result.stars,rank:def.rank,skill:def.skill,key:api.key(def)});
 if(results.length%10===0)console.log('Calculated '+results.length+'/'+defs.length+' map ratings');
}
const calibration={};
for(let rank=0;rank<=34;rank++)for(const plus of [false,true]){
 const values=results.filter(r=>r.rank===rank&&!!defs.find(d=>api.key(d)===r.key)?.plus===plus).map(r=>r.rawStars).sort((a,b)=>a-b);
 if(values.length)calibration[(plus?'plus-':'')+rank]={median:values.length%2?values[(values.length-1)/2]:(values[values.length/2-1]+values[values.length/2])/2};
}
for(let i=0;i<results.length;i++)results[i]=api.calibrate(results[i],defs[i],calibration);
fs.writeFileSync(path.join(root,'difficulty-catalog.js'),'window.STAR_SQUARE_DIFFICULTY_CALIBRATION='+JSON.stringify(calibration)+';\nwindow.STAR_SQUARE_DIFFICULTY_CATALOG='+JSON.stringify(results)+';\n');
console.log('Saved '+results.length+' pattern analyses to difficulty-catalog.js');
// Source changes here are rating / UI only. Preserve tapes and their previous verification report.
const libraryPath=path.join(root,'tas-library.json'),library=JSON.parse(fs.readFileSync(libraryPath,'utf8'));
library.rulesHash=engine.rulesHash();
library.ratingUpdateNote='Difficulty rating calibration updated. Existing input tapes are unaffected.';
fs.writeFileSync(libraryPath,JSON.stringify(library));
fs.writeFileSync(path.join(root,'tas-library.js'),'window.STAR_SQUARE_TAS_LIBRARY='+JSON.stringify(library)+';\n');

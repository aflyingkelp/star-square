import fs from 'node:fs';
import path from 'node:path';
import {createEngine,root} from './headless.mjs';
const {engine}=createEngine(),hash=engine.rulesHash(),args=process.argv.slice(2);
const wanted=args.filter(x=>!x.startsWith('--'));
let library={version:1,engineVersion:engine.version,rulesHash:hash,rate:240,policy:{hits:0,bombs:0,cheats:false,loadout:'tape-selected'},tapes:{}};
const jsonPath=process.env.STAR_SQUARE_TAS_OUTPUT||path.join(root,'tas-library.json');
if(fs.existsSync(jsonPath)){const old=JSON.parse(fs.readFileSync(jsonPath,'utf8'));if(old.rulesHash===hash)library=old}
const levels=engine.levels().filter(d=>!wanted.length||wanted.includes(d.id));
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const directions=[[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
function maskFor(dx,dy,speed){return 16|(dx<0?1:dx>0?2:0)|(dy<0?4:dy>0?8:0)|(speed===1.1?32:speed===5.4?64:0)}
function forcedMask(mask,tick,omega){
 if(!omega)return mask;
 const last=288+472*12;
 if(tick>=288&&tick<=last+3){mask&=~128;if((tick-288)%12<4)mask|=128}
 else if(tick<288)mask&=~128;
 return mask;
}
function advance(mask,count,omega,record){
 // Current tick is passed by the caller through advance.tick to avoid copying the world every tick.
 for(let i=0;i<count;i++){const m=forcedMask((mask&~128)|((mask&128)&&i<4?128:0),++advance.tick,omega);engine.tick(m);record?.push(m)}
}
function forecast(st,horizon=24){
 const hazards=Array.from({length:horizon+1},()=>[]);
 for(const b of st.bullets){
  const maxReach=(Math.hypot(b.vx,b.vy)+7)*horizon+35;
  if(Math.hypot(b.x-st.player.x,b.y-st.player.y)>maxReach)continue;
  let x=b.x,y=b.y,vx=b.vx,vy=b.vy;
  for(let f=1;f<=horizon;f++){
   if(b.homing){let a=Math.atan2(vy,vx),ta=Math.atan2(st.player.y-y,st.player.x-x),turn=Math.atan2(Math.sin(ta-a),Math.cos(ta-a)),sp=Math.hypot(vx,vy);a+=clamp(turn,-b.homing,b.homing);vx=Math.cos(a)*sp;vy=Math.sin(a)*sp}
   if(b.spin){const a=Math.atan2(vy,vx)+b.spin,sp=Math.hypot(vx,vy);vx=Math.cos(a)*sp;vy=Math.sin(a)*sp}
   if(b.accel){const sp=Math.max(.55,Math.hypot(vx,vy)+b.accel),a=Math.atan2(vy,vx);vx=Math.cos(a)*sp;vy=Math.sin(a)*sp}
   x+=vx;y+=vy;hazards[f].push(x,y,b.r+5);
  }
 }
 const b=st.boss;
 if(b&&(b.grabRush>0||b.grabTell>0&&b.grabTell<horizon)){
  let x=b.x,y=b.y,delay=b.grabRush?0:b.grabTell,left=b.grabRush||42,step=12+(st.rank||0)*.35;
  for(let f=1;f<=horizon;f++){if(f>delay&&left-->0){const dx=b.grabX-x,dy=b.grabY-y,d=Math.hypot(dx,dy)||1;x+=dx/d*step;y+=dy/d*step;hazards[f].push(x,y,43)}}
 }
 return hazards;
}
function aimX(st,variant){
 const b=st.boss;if(!b)return st.player.x;if(variant.frontline)return clamp(b.x,40,760);
 if(st.loadout.weapon==='seeker')return clamp(b.x*.35+260,140,660);
 const lead=Math.max(0,(st.player.y-b.y)/12),age=b.age+lead,rank=st.rank;
 if(b.style==='JACK')return 400+Math.sin(age*.012)*(24+rank*1.4);
 if(b.style==='TECH')return 400+Math.sin(age*.006)*(180+rank*2);
 if(b.style==='SPEED')return 400+Math.sin(age*(.012+rank*.00045))*260;
 return 400+Math.sin(age*.0035)*55;
}
function candidates(st,variant,ban){
 const p=st.player,hazards=forecast(st,variant.horizon||24),targetX=aimX(st,variant),targetY=variant.frontline?clamp((st.boss?.y||90)+variant.y,70,540):variant.follow?Math.max(180,(st.boss?.y||100)+variant.y):variant.y,rows=[];
 for(const [dx,dy] of directions)for(const speed of dx||dy?[1.1,2.3,5.4]:[2.3]){
  for(const dash of ((!st.isOmega||st.omega>=473)&&p.dashCooldown<=0&&!(st.mask&128)&&(dx||dy))?[false,true]:[false]){
   const mask=maskFor(dx,dy,speed)|(dash?128:0);if(ban?.has(mask))continue;
   let x=p.x,y=p.y,minClear=1000,cost=0;
   let inv=p.invuln;
   if(dash)inv=Math.max(inv,12+(st.loadout.upgrades.dash||0)*2+8+(st.loadout.upgrades.iframe||0)*10);
   for(let f=1;f<=24;f++){
    let mx=dx*speed,my=dy*speed;
    if(dash&&f===1){const len=Math.hypot(dx,dy)||1,sp=8.2+(st.loadout.upgrades.dash||0)*.8;mx=dx/len*sp;my=dy/len*sp}
    x=clamp(x+mx,15,785);y=clamp(y+my,24,582);
    if(inv-f>0)continue;
    const h=hazards[f];for(let j=0;j<h.length;j+=3){
     const d2=(x-h[j])**2+(y-h[j+1])**2,limit=h[j+2]+variant.margin;
     if(d2<limit*limit)cost+=100000/(f+2);
     if(d2<(limit+35)**2){const clear=Math.sqrt(d2)-h[j+2];minClear=Math.min(minClear,clear);cost+=(35-Math.min(35,Math.max(0,clear)))*.14/(1+f*.1)}
    }
   }
   cost+=Math.abs(x-targetX)*variant.aim+Math.abs(y-targetY)*.045;
   if(!variant.frontline)cost+=Math.max(0,230-y)*.25;
   if(dash)cost+=7;
   if(dx===0&&dy===0)cost-=.15;
   cost+=Math.max(0,8-minClear)*2;
   rows.push({mask,cost});
  }
 }
 return rows.sort((a,b)=>a.cost-b.cost);
}
function compress(masks){const runs=[];for(const m of masks){const last=runs.at(-1);if(last&&last[1]===m)last[0]++;else runs.push([1,m])}return runs}
function solve(level,variant){
 engine.start(level.id,{weapon:variant.weapon||(level.lnSeries==='ln7'?'needle':undefined),upgrades:variant.upgrades});let st=engine.state();
 const record=[],history=[],decisionFrames=variant.decisionFrames||16,historyLimit=variant.historyLimit||18;let rollbacks=0,decisions=0,lastLog=Date.now(),lastHP=Infinity,lastDamageTick=0;
 for(;;){
  st=engine.state();st.rank=level.pressureRank??level.rank;st.isOmega=level.omega;
  if(st.boss&&st.boss.hp<lastHP){lastHP=st.boss.hp;lastDamageTick=st.tick}
  if(st.boss&&st.tick-lastDamageTick>240*24&&(!level.omega||st.omega>=473))return null;
  if(Date.now()-lastLog>5000){console.log('SEARCH '+level.id+' at '+(st.tick/240).toFixed(1)+'s, '+rollbacks+' rewinds, boss '+Math.ceil(st.boss?.hp||0)+' HP');lastLog=Date.now()}
  if(st.result){
   if(st.result.passed&&st.hits===0&&st.bombs===0&&(!level.omega||st.omega===473)){
    record.length=st.tick;
    return {seed:engine.seedFor(level.id),weapon:st.loadout.weapon,ticks:st.tick,runs:compress(record),digest:engine.digest(),
     result:st.result,loadout:st.loadout,planner:{decisions,rollbacks,variant}};
   }return null;
  }
  if(st.tick>240*240||rollbacks>(variant.frontline?240:600))return null;
  const snap=engine.snapshot(),ban=new Set(),entry={snap,length:record.length,ban,mask:null};
  const rows=candidates(st,variant,ban);let accepted=false;
  for(const row of rows.slice(0,variant.candidateWidth||12)){
   engine.restore(snap);advance.tick=st.tick;
   const masks=[];advance(row.mask,decisionFrames,level.omega,masks);
   const next=engine.state();if(next.hits||next.bombs)continue;
   entry.mask=row.mask;record.push(...masks);accepted=true;break;
  }
  if(accepted){history.push(entry);if(history.length>historyLimit)history.shift();decisions++;continue}
  if(!history.length)return null;
  rollbacks++;
  let back=1+(Math.floor(rollbacks/30)%16);
  while(back-->1&&history.length>1)history.pop();
  const checkpoint=history.pop();record.length=checkpoint.length;checkpoint.ban.add(checkpoint.mask);
  engine.restore(checkpoint.snap);const restored=engine.state();restored.rank=level.pressureRank??level.rank;restored.isOmega=level.omega;
  const alternatives=candidates(restored,variant,checkpoint.ban);let recovered=false;
  for(const row of alternatives.slice(0,variant.recoveryWidth||22)){
   engine.restore(checkpoint.snap);advance.tick=restored.tick;const masks=[];advance(row.mask,decisionFrames,level.omega,masks);
   if(engine.state().hits)continue;
   checkpoint.mask=row.mask;record.push(...masks);history.push(checkpoint);recovered=true;break;
  }
  if(!recovered){if(!history.length)return null;const prev=history.pop();record.length=prev.length;engine.restore(prev.snap)}
 }
}
function independentlyVerify(level,tape){
 const {engine:fresh}=createEngine();fresh.start(level.id,tape);
 let ticks=0;
 for(const [length,mask] of tape.runs)for(let i=0;i<length;i++){fresh.tick(mask);ticks++}
 const st=fresh.state(),digest=fresh.digest();
 if(ticks!==tape.ticks||st.tick!==tape.ticks||!st.result?.passed||st.hits||st.bombs||digest!==tape.digest||
   level.omega&&st.omega!==473)throw Error('Independent verification failed: '+level.id+' '+JSON.stringify({stTick:st.tick,ticks,digest,expected:tape.digest,result:st.result}));
}
function save(){
 if(args.includes('--dry-run'))return;
 for(const [id,tape] of Object.entries(library.tapes))if(tape.seed===undefined)tape.seed=engine.seedFor(id);
 library.complete=Object.keys(library.tapes).length===engine.levels().length;
 fs.writeFileSync(jsonPath,JSON.stringify(library));
 if(!process.env.STAR_SQUARE_TAS_OUTPUT)fs.writeFileSync(path.join(root,'tas-library.js'),'window.STAR_SQUARE_TAS_LIBRARY='+JSON.stringify(library)+';\n');
}
const failures=[];
for(const level of levels){
 if(library.tapes[level.id]&&!args.includes('--force')){console.log('CACHED '+level.id);continue}
 const started=Date.now();let tape=null;
 const variants=[{y:65,frontline:true,margin:4,aim:.18},{y:110,frontline:true,margin:4,aim:.15},{y:420,margin:3,aim:.028},{y:340,margin:3,aim:.04,weapon:level.rank>=2?'needle':undefined},{y:350,margin:3,aim:.2,weapon:level.rank>=2?'needle':undefined},{y:130,follow:true,margin:3,aim:.06,weapon:level.rank>=4?'fan':undefined},{y:500,margin:2,aim:.018},{y:340,margin:4,aim:.03},{y:280,margin:3,aim:.035},{y:440,margin:6,aim:.012}];
 const optimizedUpgrades={power:3,fire:3,hearts:2,bomb:2,dash:3,iframe:2,graze:2,breather:2};
 if(args.includes('--wide-search'))variants.unshift(...[65,110,180,250].flatMap(y=>[.35,.8].map(aim=>({y,frontline:true,margin:0,aim,horizon:48,decisionFrames:8,historyLimit:48,candidateWidth:49,recoveryWidth:49,weapon:level.lnSeries==='ln7'?'needle':undefined,upgrades:level.lnSeries==='ln7'?optimizedUpgrades:undefined}))));
 if(args.includes('--precision-search'))variants.unshift(...[65,110,180].flatMap(y=>[.18,.5].map(aim=>({y,frontline:true,margin:0,aim,horizon:24,decisionFrames:2,historyLimit:144}))));
 if(args.includes('--aggressive'))variants.unshift({y:310,margin:3,aim:.05,weapon:level.rank>=2?'needle':undefined});
 if(args.includes('--chase'))variants.unshift({y:350,margin:3,aim:.2,weapon:level.rank>=2?'needle':undefined});
 for(const variant of variants){console.log('PLAN '+level.id+' '+JSON.stringify(variant));tape=solve(level,variant);if(tape)break}
 if(!tape){failures.push(level.id);console.log('FAILED '+level.id);continue}
 independentlyVerify(level,tape);library.tapes[level.id]=tape;save();
 console.log('VERIFIED '+level.id+' '+(tape.ticks/240).toFixed(2)+'s '+tape.runs.length+' blocks '+((Date.now()-started)/1000).toFixed(1)+'s planning');
}
console.log('Verified '+Object.keys(library.tapes).length+'/'+engine.levels().length+' levels; failures: '+failures.join(','));
if(failures.length)process.exitCode=1;

(function(){
'use strict';
const W=800,H=600,canvas=document.getElementById('game'),ctx=canvas.getContext('2d'),overlay=document.getElementById('overlay'),modal=document.getElementById('modal');
let mode='menu',run=null,keys={},bank=0,focusedChart=0;
const api=()=>window.SquareCatchAPI;
const style=document.createElement('style');style.textContent='.catch-help{display:flex;flex-wrap:wrap;gap:7px 14px;margin:12px 0;padding:12px;background:#0a1225;border:1px solid #344569;border-radius:9px;color:#c8d4f2;font-size:12px}.catch-help b{width:100%;color:#64f3e3;letter-spacing:.12em}.catch-help kbd{display:inline-block;padding:1px 5px;border:1px solid #53658e;border-bottom-width:2px;border-radius:4px;background:#1a2440;color:#fff;font:inherit}.levelnode.catch-focused{outline:2px solid #64f3e3;outline-offset:2px;box-shadow:0 0 18px #64f3e355}';document.head.appendChild(style);
function show(html){if(!overlay||!modal)throw Error('Catch UI is missing its overlay');overlay.classList.remove('hidden');modal.classList.add('wide');modal.innerHTML=html}
function back(){mode='menu';window.catchModeActive=false;overlay.classList.add('hidden');api().showTitle()}
function fail(error){mode='tree';window.catchModeActive=true;show('<h1>CATCH <span>COULD NOT OPEN</span></h1><p>'+String(error?.message||error||'Unknown error').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))+'</p><p class="sub">Reload the page if this persists. Your other game modes and saves are unaffected.</p><div class="btnrow"><button class="btn primary" id="catchRetryOpen">Try again</button><button class="btn" id="catchErrorBack">Title</button></div>');modal.classList.remove('wide');modal.querySelector('#catchRetryOpen').onclick=open;modal.querySelector('#catchErrorBack').onclick=back}
function open(){try{if(!api()||!Array.isArray(api().levels))throw Error('Catch charts did not load');mode='tree';window.catchModeActive=true;tree()}catch(error){fail(error)}}
function tree(){
 const a=api(), defs=a.levels, groups=[];
 defs.forEach(function(src){const plus=!!src.plus,key=src.rank+':'+plus;let g=groups.find(x=>x.key===key);if(!g){g={key:key,rank:src.rank,plus:plus,levels:[]};groups.push(g)}g.levels.push(src)});
 let bands=groups.map(function(g){const items=g.levels.map(function(d,i){const id=d.id,done=!!a.save.catchCleared[id],prev=i>0&&g.levels.slice(0,i).every(x=>a.save.catchCleared[x.id]),prior=defs.filter(x=>x.rank===d.rank-1&&!x.plus),base=defs.filter(x=>x.rank===d.rank&&!x.plus),unlocked=(d.rank===0&&!g.plus&&i===0)||prev||(g.plus&&i===0&&base.length&&base.every(x=>a.save.catchCleared[x.id]))||(!g.plus&&i===0&&d.rank>0&&prior.length&&prior.every(x=>a.save.catchCleared[x.id])),best=a.save.catchResults[id]||{};
 return '<button class="levelnode '+(done?'complete':'')+'" data-catch="'+id+'" '+(unlocked?'':'disabled')+'><small>'+d.skill+' · '+(g.plus?'PLUS':d.dan)+'</small><b>'+d.title+'</b><small>★ '+a.star(d).toFixed(2)+' stars</small><span>'+(done?'BEST '+Number(best.bestPP||0).toFixed(1)+' Catch PP':unlocked?'Catch the falling stars':'Clear the previous Catch set first')+'</span></button>'}).join('');
 return '<section class="danband"><div class="bandtitle"><b>'+(g.rank===0?'Tutorial':a.danName(g.rank))+(g.plus?' +':'')+'</b><span>Four lane charts · '+(g.plus?'barely possible plus set':'catch progression')+'</span></div><div class="levelgrid">'+items+'</div></section>'}).join('');
 show('<div class="treehead"><div><h1>STAR//SQUARE <span>CATCH</span></h1><p>Catch falling stars with your basket. Pick a chart below or use the keyboard to choose one.</p><div class="catch-help"><b>CONTROLS</b><span><kbd>Mouse</kbd> or <kbd>←</kbd>/<kbd>→</kbd> or <kbd>A</kbd>/<kbd>D</kbd> Move</span><span><kbd>Shift</kbd> / <kbd>Space</kbd> Dash</span><span><kbd>Esc</kbd> Pause / back</span><span><kbd>R</kbd> Restart · <kbd>Enter</kbd> Start focused chart</span><span>On chart list: <kbd>↑</kbd>/<kbd>↓</kbd> move selection, <kbd>Enter</kbd> play</span></div><p class="sub">Separate Catch PP: '+Number(a.save.catchPP||0).toFixed(2)+' · Catch clears do not change danmaku rank.</p></div><button class="btn" id="catchBack">Title · Esc</button></div>'+bands);
 modal.classList.add('wide');modal.querySelector('#catchBack').onclick=back;
 const charts=[...modal.querySelectorAll('[data-catch]:not(:disabled)')];focusedChart=Math.max(0,Math.min(focusedChart,charts.length-1));charts.forEach(function(b,i){b.onclick=function(){const d=defs.find(x=>x.id===b.dataset.catch);if(d)start(d)};b.classList.toggle('catch-focused',i===focusedChart)});if(charts[focusedChart])charts[focusedChart].setAttribute('aria-current','true');
}
function start(def){
 mode='play';keys={};bank=0;
 run={def:def,time:0,score:0,caught:0,missed:0,lives:5,combo:0,bestCombo:0,fruits:[],spawn:0,player:W/2,target:W/2,dash:0,cooldown:0,result:null};
 overlay.classList.add('hidden');modal.classList.remove('wide');window.catchModeActive=true;
}
function spawn(){
 const d=run.def,rank=d.rank+(d.plus?2:0),spacing=48+Math.max(8,35-rank*.6),count=Math.min(7,1+Math.floor(rank/7)+(d.skill==='STAMINA'?1:0)),center=65+Math.random()*(W-130);
 for(let i=0;i<count;i++){
  let x=center;
  if(d.skill==='JACK')x=center+(i%2?1:-1)*spacing*(Math.floor(i/2)+.5);
  else if(d.skill==='TECH')x=65+((center+i*spacing*2+Math.sin(run.time+i)*80)%(W-130));
  else if(d.skill==='SPEED')x=30+((run.time*190+i*spacing)%(W-60));
  else x=center+Math.sin(run.time*.7+i*.8)*spacing*(i+1);
  run.fruits.push({x:Math.max(18,Math.min(W-18,x)),y:-24-i*30,vy:180+rank*4.5+(d.skill==='SPEED'?45:0),kind:d.skill==='TECH'&&i%4===0?'droplet':'fruit',r:15,alive:true});
 }
 if(d.skill==='TECH'&&Math.random()<.28)run.fruits.push({x:center,y:-36,vy:180+rank*3,r:14,kind:'hazard',alive:true});
}
function tick(dt){
 const d=run.def,rank=d.rank+(d.plus?2:0),speed=300+Math.min(230,rank*8),width=Math.max(38,76-rank*.7);
 run.time+=dt;
 if(keys.left)run.target-=speed*dt*(run.dash>0?3:1);
 if(keys.right)run.target+=speed*dt*(run.dash>0?3:1);
 if(run.dash>0)run.dash-=dt;
 run.cooldown=Math.max(0,run.cooldown-dt);
 if(keys.dash&&run.cooldown===0){run.dash=.24;run.cooldown=1.05}
 run.target=Math.max(30,Math.min(W-30,run.target));
 const move=speed*(run.dash>0?3:1)*dt;run.player+=Math.max(-move,Math.min(move,run.target-run.player));
 run.spawn-=dt;if(run.spawn<=0){spawn();run.spawn=Math.max(.3,.85-rank*.008)+(d.skill==='STAMINA'?.08:0)}
 run.fruits.forEach(function(f){if(!f.alive)return;f.y+=f.vy*dt;if(f.y>=H-78&&f.y<H-52&&Math.abs(f.x-run.player)<=width+f.r){f.alive=false;if(f.kind==='hazard'){run.lives--;run.combo=0}else{run.caught++;run.combo++;run.bestCombo=Math.max(run.bestCombo,run.combo);run.score+=f.kind==='droplet'?50:300+Math.min(300,run.combo*2)}}else if(f.y>H+20){f.alive=false;if(f.kind==='fruit'){run.missed++;run.combo=0;if(run.missed%5===0)run.lives--}}});
 run.fruits=run.fruits.filter(f=>f.alive);
 if(run.lives<=0)finish(false);else if(run.time>=34+Math.min(30,rank*.8))finish(true);
}
function finish(passed){
 const a=api(),accuracy=run.caught+run.missed?100*run.caught/(run.caught+run.missed):0,pp=passed?Math.round(a.base(a.star(run.def))*Math.pow(accuracy/100,3)*Math.min(1.18,1+run.bestCombo/600)*100)/100:0;
 run.result={passed:passed,accuracy:accuracy,pp:pp,grade:passed?(accuracy>=99?'SS':accuracy>=95?'S':accuracy>=85?'A':'B'):'FAIL'};
 if(passed){const old=a.save.catchResults[run.def.id]||{};a.save.catchCleared[run.def.id]=true;a.save.catchResults[run.def.id]={bestPP:Math.max(Number(old.bestPP)||0,pp),bestAccuracy:Math.max(Number(old.bestAccuracy)||0,accuracy),bestCombo:Math.max(Number(old.bestCombo)||0,run.bestCombo),score:run.score,grade:run.result.grade}}
 const rows=Object.values(a.save.catchResults).map(x=>Number(x.bestPP)||0).sort((x,y)=>y-x);a.save.catchPP=Math.round(rows.reduce((sum,x,i)=>sum+x*Math.pow(.95,i),0)*100)/100;a.persist();
 mode='results';window.catchModeActive=true;show('<h1>'+(passed?'CATCH <span>CLEAR</span>':'CATCH <span>FAILED</span>')+'</h1><p>'+run.def.dan+' · '+run.def.skill+' · '+run.def.title+'</p><div class="resultgrid">'+[['GRADE',run.result.grade],['ACCURACY',accuracy.toFixed(2)+'%'],['CAUGHT',run.caught],['MISSED',run.missed],['BEST COMBO',run.bestCombo],['PP',pp.toFixed(2)+' Catch PP']].map(x=>'<div><small>'+x[0]+'</small><b>'+x[1]+'</b></div>').join('')+'</div><p class="sub">Total Catch PP: '+a.save.catchPP.toFixed(2)+' · independent from danmaku ranked PP.</p><div class="btnrow"><button class="btn primary" id="catchAgain">Retry</button><button class="btn" id="catchTree">Dan tree</button><button class="btn" id="catchTitle">Title</button></div>');
 modal.classList.remove('wide');modal.querySelector('#catchAgain').onclick=function(){start(run.def)};modal.querySelector('#catchTree').onclick=function(){mode='tree';tree()};modal.querySelector('#catchTitle').onclick=back;
}
function draw(){
 const gr=ctx.createLinearGradient(0,0,0,H);gr.addColorStop(0,'#18264a');gr.addColorStop(1,'#080b18');ctx.fillStyle=gr;ctx.fillRect(0,0,W,H);
 ctx.strokeStyle='#26375b';for(let x=35;x<W;x+=50){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}
 if(!run)return;const d=run.def,rank=d.rank+(d.plus?2:0),duration=34+Math.min(30,rank*.8),width=Math.max(38,76-rank*.7);
 run.fruits.forEach(function(f){ctx.save();ctx.translate(f.x,f.y);ctx.shadowBlur=14;ctx.shadowColor=f.kind==='hazard'?'#ff4e72':f.kind==='droplet'?'#62baff':'#ffd56a';ctx.fillStyle=f.kind==='hazard'?'#e44c78':f.kind==='droplet'?'#68aaff':(Math.sin(f.x+f.y)>.1?'#ffe279':'#ff8fb8');ctx.beginPath();ctx.arc(0,0,f.r,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font='bold 12px Segoe UI';ctx.textAlign='center';ctx.fillText(f.kind==='hazard'?'×':'✦',0,4);ctx.restore()});
 const x=run.player,y=H-55;ctx.fillStyle=run.dash>0?'#6ffff0':'#76d9eb';ctx.strokeStyle='#d7fbff';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x-width,y-18);ctx.lineTo(x-width+9,y+5);ctx.quadraticCurveTo(x,y+18,x+width-9,y+5);ctx.lineTo(x+width,y-18);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x,y-7,10,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#fff';ctx.font='bold 19px Segoe UI';ctx.textAlign='left';ctx.fillText(d.dan+' · '+d.skill+' · '+d.title,22,32);ctx.font='15px Segoe UI';ctx.fillStyle='#d0d9f0';ctx.fillText('SCORE '+run.score.toLocaleString()+'   '+run.caught+' caught   COMBO '+run.combo+'   '+run.missed+' missed',22,58);
 ctx.fillStyle='#26324e';ctx.fillRect(22,73,W-44,8);ctx.fillStyle='#64f3e3';ctx.fillRect(22,73,(W-44)*Math.min(1,run.time/duration));ctx.textAlign='right';ctx.fillStyle='#ff809b';ctx.font='bold 17px Segoe UI';ctx.fillText('♥ '.repeat(Math.max(0,run.lives)),W-25,107);ctx.textAlign='center';ctx.fillStyle='#97a8d2';ctx.font='12px Segoe UI';ctx.fillText('MOUSE OR ← → TO MOVE · SHIFT / SPACE TO DASH · ESC TO PAUSE',W/2,H-16);
}
function frame(elapsed){if(mode==='play'){bank=Math.min(50,bank+elapsed);let n=0;while(bank>=1000/60&&n++<3){tick(1/60);bank-=1000/60}}draw()}
function keydown(e){
 const k=e.key.toLowerCase();
 if(mode==='play'){if(['arrowleft','arrowright',' ','shift','escape'].includes(k))e.preventDefault();if(k==='arrowleft'||k==='a')keys.left=true;if(k==='arrowright'||k==='d')keys.right=true;if(k===' '||k==='shift')keys.dash=true;if(k==='escape'){mode='paused';show('<h1>CATCH <span>PAUSED</span></h1><p>'+run.def.title+' · '+Math.floor(run.time)+'s · '+run.score.toLocaleString()+' points</p><div class="catch-help">Move: mouse or ← → / A D · Dash: Shift / Space · Restart: R</div><div class="btnrow"><button class="btn primary" id="resume">Resume · Esc</button><button class="btn" id="retry">Retry · R</button><button class="btn" id="exit">Dan tree</button></div>');modal.classList.remove('wide');modal.querySelector('#resume').onclick=function(){mode='play';keys={};overlay.classList.add('hidden')};modal.querySelector('#retry').onclick=function(){start(run.def)};modal.querySelector('#exit').onclick=function(){mode='tree';tree()}}if(k==='r')start(run.def)}
 else if(mode==='tree'){if(k==='escape'){e.preventDefault();back()}else if(k==='arrowdown'||k==='arrowright'||k==='arrowup'||k==='arrowleft'){e.preventDefault();const charts=[...modal.querySelectorAll('[data-catch]:not(:disabled)')];if(charts.length){let delta=(k==='arrowdown'||k==='arrowright')?1:-1;focusedChart=(focusedChart+delta+charts.length)%charts.length;charts.forEach((b,i)=>{b.classList.toggle('catch-focused',i===focusedChart);b.removeAttribute('aria-current')});charts[focusedChart].setAttribute('aria-current','true');charts[focusedChart].scrollIntoView({block:'nearest'})}}else if(k==='enter'||k===' '){e.preventDefault();modal.querySelectorAll('[data-catch]:not(:disabled)')[focusedChart]?.click()}}
 else if(k==='escape'&&mode==='results'){mode='tree';tree()}else if(k==='escape'&&mode==='paused'){mode='play';keys={};overlay.classList.add('hidden')}
}
function keyup(e){if(e.key==='ArrowLeft'||e.key.toLowerCase()==='a')keys.left=false;if(e.key==='ArrowRight'||e.key.toLowerCase()==='d')keys.right=false;if(e.key===' '||e.key==='Shift')keys.dash=false}
canvas.addEventListener('pointermove',function(e){if(mode!=='play')return;const r=canvas.getBoundingClientRect();run.target=(e.clientX-r.left)/r.width*W});
window.SquareCatchGame={open:open,frame:function(elapsed){try{frame(elapsed)}catch(error){fail(error)}},keydown:keydown,keyup:keyup};
})();

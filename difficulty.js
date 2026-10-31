/* Shared deterministic pattern simulation and measured star ratings. */
function squareDifficultyModule() {
  'use strict';
  const VERSION = 'measured-pattern-8';
  const names = ['Precision', 'Movement', 'Reading', 'Timing', 'Endurance'];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function clean(def) {
    // Cosmetic data, names, IDs, and previous ratings never affect difficulty.
    return {rank: +def.rank || 0, pressureRank: +def.pressureRank || +def.rank || 0, plus: !!def.plus, skill: def.skill || 'Fundamentals', custom: !!def.custom,
      lnSeries:def.lnSeries||'',lnIndex:+def.lnIndex||0,lnStage:+def.lnStage||0,
      omega: !!def.omega, attacks: def.attacks || [0, 1, 2], patterns: def.patterns || null,
      timelineVersion: def.timelineVersion || 0, cadence: +def.cadence || 68,
      bulletSpeed: +def.bulletSpeed || 1, bossHp: +def.bossHp || 0};
  }
  function key(def) { return VERSION + ':' + JSON.stringify(clean(def)); }
  function runtimeSource(functions) {
    // These are trusted functions serialized from the running game, never map code.
    return '(function(def){let selectedLevel=def,boss=null,player={x:400,y:528},bullets=[];' +
      'const W=800,H=600,saved={upgrades:{}},say=()=>{};let collisions=0;' +
      'function damage(){collisions++}' + functions.join('\n') +
      ';return {get boss(){return boss},set boss(v){boss=v},get player(){return player},' +
      'get bullets(){return bullets},set bullets(v){bullets=v},fire:fireBossPattern,' +
      'timeline:()=>customTimelineAt(selectedLevel,boss.age),advance:advanceWorkshopBullet,' +
      'motion:ratingBossMotion,get collisions(){return collisions}}})';
  }
  function aggregate(values) {
    const sorted = values.slice().sort((a, b) => b - a);
    let sum = 0, weight = 1;
    for (const v of sorted) { sum += v * weight; weight *= .93; }
    return sum * .07;
  }
  function combined(skills) { return Math.pow(skills.reduce((sum, v) => sum + Math.pow(v, 2.2), 0), 1 / 2.2); }
  function rankStars(rank) {
    rank=clamp(Math.floor(+rank||0),0,34);
    if(rank<=1)return 1;
    if(rank<=20)return 1+10*(rank-1)/19;
    return 11+33*(rank-20)/14;
  }
  function calibrate(result,def,baselines) {
    const rawStars=Number.isFinite(+result.rawStars)?+result.rawStars:+result.stars;
    if(def?.lnSeries){
      const index=Math.max(0,+def.lnIndex||0),stage=Math.max(0,+def.lnStage||0);
      const laneAdjustment=.2+Math.min(.6,index*.03)+stage*.12;
      return {...result,rawStars,stars:Math.round((Math.max(0,rawStars)+laneAdjustment)*100)/100,laneAdjustment:Math.round(laneAdjustment*100)/100,balanced:true};
    }
    const rank=clamp(Math.floor(+def?.rank||0),0,34);
    const median=+(baselines?.[(def?.plus?'plus-':'')+rank]?.median??baselines?.[rank]?.median??rawStars);
    const adjustment=rank===0||rank===20||rank===34?0:clamp((rawStars-median)*.35,-.6,.6);
    const plusBonus=def?.plus?Math.min(4.5,1.1+(rank-11)*.15):0;
    return {...result,rawStars,stars:Math.round((rankStars(rank)+adjustment+plusBonus)*100)/100,
      laneAdjustment:Math.round(adjustment*100)/100,balanced:true};
  }
  function afterMods(result,mods={}) {
    if(!result||!mods.DT)return result;
    if(Number.isFinite(+result.dtStars))return {...result,baseStars:Number(result.stars)||0,stars:+result.dtStars,dtEstimate:'precomputed'};
    const baseStars=Math.max(0,Number(result.stars)||0),sections=Array.isArray(result.sections)?result.sections:[];
    const timed=sections.some(section=>Number.isFinite(section.window)&&section.window>0);
    if(!timed)return {...result,baseStars,stars:Math.round(baseStars*Math.pow(1.5,.2)*100)/100,dtEstimate:'star-rate fallback'};
    const requirement=result.requirement;
    let dtRequirementTiming=0,dtRequirementEndurance=0;
    if(requirement){
      const rate=1000/Math.max(1,Number(requirement.intervalMs)||50),window=Math.max(1,Number(requirement.windowMs)||1000/240)/1.5;
      dtRequirementTiming=Math.log2(1+100/window)*Math.sqrt(rate/2);
      dtRequirementEndurance=dtRequirementTiming*.35*Math.sqrt(Math.log2(1+(Number(requirement.count)||1))/4);
    }
    const adjusted=sections.map(section=>{
      const values=Array.isArray(section.values)?section.values.slice():[0,0,0,0,0];
      const original=values.slice();
      if(Number.isFinite(section.window)&&section.window>0){
        const before=Math.log2(1+100/Math.max(4.167,section.window))*.5;
        const faster=Math.log2(1+100/Math.max(4.167,section.window/1.5))*.5;
        if(before>0)values[3]*=faster/before;
      }
      if(requirement&&section.time>=1.2&&section.time<=(288+12*472)/240){
        values[3]=Math.max(values[3],dtRequirementTiming);
        values[4]=Math.max(values[4],dtRequirementEndurance);
      }
      const oldPressure=combined(original.slice(0,4)),newPressure=combined(values.slice(0,4));
      if(oldPressure>0)values[4]*=newPressure/oldPressure;
      return values;
    });
    const skills=names.map((_,i)=>aggregate(adjusted.map(values=>values[i])));
    if(requirement){skills[3]=Math.hypot(skills[3],dtRequirementTiming);skills[4]=Math.hypot(skills[4],dtRequirementEndurance);}
    const stars=Math.round(Math.max(0,combined(skills))*100)/100;
    return {...result,baseStars,stars,skills:Object.fromEntries(names.map((name,i)=>[name,Math.round(skills[i]*100)/100])),dtEstimate:'section reaction windows × 1.5'};
  }
  async function analyze(def, makeRuntime, yieldWork = () => Promise.resolve()) {
    def = clean(def);
    const rank = def.pressureRank;
    const hp = def.custom ? def.bossHp || 500 + rank * 55 : 470 + rank * 66 + Math.max(0, rank - 10) * 28;
    const cycle = def.custom && def.timelineVersion === 1 ? def.patterns.reduce((s, p) => s + clamp(+p.duration || 6, .5, 60), 0) : Math.max(150, 230 - rank * 3) / 20;
    // Fixed reference exposure: 24 damage/second, same movement and no upgrades for every map.
    // Always inspect a whole animation cycle, including late keyframes.
    const seconds = Math.max(cycle, Math.min(hp / 24, 100));
    const frames = Math.ceil(seconds * 60), routes = [];
    for (let policy = 0; policy < 3; policy++) {
      const rt = makeRuntime(def), p = rt.player;
      rt.boss = {x:400,y:90,age:0,fire:def.timelineVersion === 1 ? 1 : 30,phase:0,volley:0,
        style:def.skill,grabTell:0,grabRush:0,grabHold:0,grabCooldown:Math.max(150,310-rank*7),grabX:400,grabY:510};
      let move = {x:0,y:0}, cooldown = 0, invuln = 0, hits = 0, lastHit = -999;
      let lastDX = 0, lastDY = 0, previousSpeed = 0, reversals = 0;
      let section = [0,0,0,0,0], strain = [0,0,0,0,0], sections = [], exposure = 0;
      let minMargin = Infinity, timingWindow = Infinity, decisions = 0, totalDash = 0;
      let sectionMargin = Infinity, sectionWindow = Infinity;
      for (let frame = 1; frame <= frames; frame++) {
        const boss = rt.boss;
        p.invuln=invuln;rt.motion();
        const timeline = rt.timeline(), phase = timeline ? timeline.phase : Math.floor(boss.age / Math.max(150,230-rank*3)) % 3;
        if (phase !== boss.phase) { boss.phase = phase; if (timeline) boss.fire = 0; }
        if (--boss.fire <= 0) {
          rt.fire(phase);
          const cadence = timeline ? timeline.pattern.cadence : def.custom ? def.cadence : def.lnSeries ? Math.max(15,34-def.lnIndex*1.3-def.lnStage*4.5) : def.skill === 'SPEED' ? 70-rank*2.7 : def.skill === 'JACK' ? 76-rank*2.8 : def.skill === 'TECH' ? 86-rank*2.9 : 94-rank*3.1;
          boss.fire = Math.max(15, cadence);
        }
        if (cooldown > 0) cooldown--;
        if (invuln > 0) invuln--;
        let near = [];
        for (let i = rt.bullets.length-1; i >= 0; i--) {
          const b = rt.bullets[i];
          rt.advance(b,p);
          if (b.ttl !== undefined && --b.ttl <= 0 || b.x < -30 || b.x > 830 || b.y < -30 || b.y > 630) { rt.bullets.splice(i,1); continue; }
          const distance = Math.hypot(b.x-p.x,b.y-p.y);
          if (distance < 240 + Math.hypot(b.vx,b.vy)*24) near.push(b);
        }
        if ((frame-1)%12 === 0) {
          // Limit path probes to the nearest threats; distant decorative volleys
          // become relevant as they enter the player's movement horizon.
          if(near.length>48){near.sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));near.length=48;}
          // Evaluate legal focus / normal / sprint directions with swept segment clearance.
          // Policies prefer different space, so one fragile route cannot define the rating alone.
          const candidates = [{x:0,y:0}];
          // Check every normal direction and cardinal focus/sprint routes.
          for (let j=0;j<8;j++) {
            const dx=[1,1,0,-1,-1,-1,0,1][j],dy=[0,1,1,1,0,-1,-1,-1][j];
            candidates.push({x:dx*2.3,y:dy*2.3});
          }
          for(const speed of [1.1,5.4])for(let j=0;j<4;j++){
            const dx=[1,0,-1,0][j],dy=[0,1,0,-1][j];candidates.push({x:dx*speed,y:dy*speed});
          }
          // Forecast curved/homing paths with the same integrator as gameplay.
          // Aimed future volleys remain uncertain; each route gets its own actual aim.
          const forecasts=new Map();
          for(const b of near)if(b.spin||b.homing||b.accel){
            const copy={...b},points=[{x:b.x,y:b.y,time:0}];
            for(let tick=1;tick<=24;tick++){rt.advance(copy,p);if(tick%6===0)points.push({x:copy.x,y:copy.y,time:tick});}
            forecasts.set(b,points);
          }
          let best = null, legal = 0;
          for (const c of candidates) {
            let clearance = 120, earliest = 60;
            for (const b of near) {
              const forecast=forecasts.get(b);
              if(forecast){
                for(let j=1;j<forecast.length;j++){
                  const a=forecast[j-1],z=forecast[j],rx=a.x-p.x-c.x*a.time,ry=a.y-p.y-c.y*a.time;
                  const vx=(z.x-a.x)/6-c.x,vy=(z.y-a.y)/6-c.y;
                  const tt=clamp(-(rx*vx+ry*vy)/(vx*vx+vy*vy||1),0,6);
                  const gap=Math.hypot(rx+vx*tt,ry+vy*tt)-b.r-5;
                  clearance=Math.min(clearance,gap);if(gap<12)earliest=Math.min(earliest,a.time+tt);
                }
              }else{
                const rx=b.x-p.x,ry=b.y-p.y,vx=b.vx-c.x,vy=b.vy-c.y;
                const tt=clamp(-(rx*vx+ry*vy)/(vx*vx+vy*vy||1),0,24);
                const gap=Math.hypot(rx+vx*tt,ry+vy*tt)-b.r-5;
                clearance=Math.min(clearance,gap);if(gap<12)earliest=Math.min(earliest,tt);
              }
            }
            const x=p.x+c.x*12,y=p.y+c.y*12;
            const boundary=Math.min(x-15,785-x,y-24,582-y);
            const bulletClearance=clearance;
            clearance=Math.min(clearance,boundary);
            if(clearance>0)legal++;
            const anchor = policy===0?400:policy===1?220:580;
            const cost = Math.min(55,clearance)*2 - Math.hypot(c.x,c.y)*.45 - Math.abs(x-anchor)*.012 - Math.abs(y-490)*.015;
            if(!best||cost>best.cost)best={...c,clearance,bulletClearance,earliest,cost};
          }
          if (best.clearance < 0 && cooldown === 0) {
            // Legal baseline dash: 135-frame cooldown, 12 movement frames, 20 i-frames.
            const len=Math.hypot(best.x,best.y)||1;
            move={x:best.x/len*8.2,y:(best.x===0&&best.y===0?-1:best.y/len)*8.2,dash:12};
            invuln=20;cooldown=135;totalDash++;
          } else if (!move.dash) move={x:best.x,y:best.y,focus:!!best.focus};
          const speed=Math.hypot(move.x,move.y), reversal=lastDX*move.x+lastDY*move.y<0?1:0;
          const threatened=best.bulletClearance<55 && near.length>0;
          const squeeze=threatened?Math.log2(1+18/Math.max(.5,best.bulletClearance)):0;
          const decision=threatened?(1-legal/candidates.length):0;
          let changing=0, approaching=0;
          for(const b of near) {
            const dx=b.x-p.x,dy=b.y-p.y,d=Math.hypot(dx,dy);
            if(d<120){changing+=Math.abs(b.spin||0)+(b.homing||0);if(dx*b.vx+dy*b.vy<0)approaching++;}
          }
          const window=threatened?Math.max(1,best.bulletClearance/Math.max(1,speed+previousSpeed)*1000/60):Infinity;
          const raw=[squeeze,threatened?(speed/5.4+reversal*.8)*decision:0,
            threatened?decision*Math.log2(1+approaching)*.7+Math.min(3,changing*8):0,
            threatened?Math.log2(1+100/Math.max(4.167,window))*.5:0,0];
          if(threatened){exposure++;decisions+=decision;sectionMargin=Math.min(sectionMargin,Math.max(0,best.bulletClearance));sectionWindow=Math.min(sectionWindow,window);}
          for(let k=0;k<4;k++)strain[k]=strain[k]*Math.exp(-.1/.65)+raw[k]*(1-Math.exp(-.1/.65));
          strain[4]=strain[4]*Math.exp(-.1/5)+combined(raw.slice(0,4))*(1-Math.exp(-.1/5));
          for(let k=0;k<5;k++)section[k]=Math.max(section[k],strain[k]);
          if(threatened)reversals+=reversal;
          lastDX=move.x;lastDY=move.y;previousSpeed=speed;
        }
        p.x=clamp(p.x+move.x,15,785);p.y=clamp(p.y+move.y,24,582);
        if(move.dash&&--move.dash<=0)move={x:0,y:0};
        for(const b of near)if(Math.hypot(b.x-p.x,b.y-p.y)<b.r+(move.focus?2.5:5) && invuln===0 && frame-lastHit>1){hits++;lastHit=frame;break;}
        if(frame%24===0||frame===frames){
          sections.push({time:frame/60,values:section,margin:Number.isFinite(sectionMargin)?sectionMargin:null,window:Number.isFinite(sectionWindow)?sectionWindow:null});
          minMargin=Math.min(minMargin,sectionMargin);timingWindow=Math.min(timingWindow,sectionWindow);
          section=[0,0,0,0,0];sectionMargin=Infinity;sectionWindow=Infinity;
        }
        // Yield even without Worker support; never block the editor for a complete map.
        if(frame%120===0)await yieldWork();
      }
      const skills=names.map((_,i)=>aggregate(sections.map(s=>s.values[i])));
      // Endurance counts actual demanding exposure, not empty boss HP / idle duration.
      skills[4]*=Math.sqrt(Math.log2(1+exposure*.1)/4);
      routes.push({skills,sections,hits:hits+rt.collisions,margin:Number.isFinite(minMargin)?minMargin:null,
        window:Number.isFinite(timingWindow)?timingWindow:null,dashes:totalDash,decisions,reversals});
    }
    routes.sort((a,b)=>a.hits-b.hits||combined(a.skills)-combined(b.skills));
    const best=routes[0],skills=best.skills.slice();
    let requirement=null;
    if(def.omega){
      requirement={count:473,windowMs:1000/240,intervalMs:50};
      const rate=1000/requirement.intervalMs,precision=Math.log2(1+100/requirement.windowMs);
      const timing=precision*Math.sqrt(rate/2);
      skills[3]=Math.hypot(skills[3],timing);
      skills[4]=Math.hypot(skills[4],timing*.35*Math.sqrt(Math.log2(1+requirement.count)/4));
      for(const s of best.sections)if(s.time>=1.2&&s.time<=(288+12*472)/240){s.values[3]=Math.max(s.values[3],timing);s.values[4]=Math.max(s.values[4],skills[4]);}
    }
    const stars=Math.round(combined(skills)*100)/100;
    return {version:VERSION,stars,skills:Object.fromEntries(names.map((n,i)=>[n,Math.round(skills[i]*100)/100])),
      sections:best.sections.map(s=>({...s,value:combined(s.values)})),seconds,requirement,
      status:best.hits===0?'route-found':'route-unverified',routeCollisions:best.hits,
      routes:routes.map(r=>({collisions:r.hits,margin:r.margin,windowMs:r.window,dashes:r.dashes})),
      baseline:'No bombs; 5 px hit radius; focus 1.1, normal 2.3, sprint 5.4 px/frame; base dash; up to 100 s reference exposure at 24 DPS, at least one full animation cycle.',
      note:'Experimental estimate. Three heuristic routes; search failure does not prove impossibility. Scale awaits human play calibration.'};
  }
  return {VERSION,names,clean,key,runtimeSource,analyze,rankStars,calibrate,afterMods};
}
if(typeof module!=='undefined'&&module.exports)module.exports=squareDifficultyModule();
if(typeof window!=='undefined')window.SquareDifficulty=squareDifficultyModule();

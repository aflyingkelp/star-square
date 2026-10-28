const finite=(n,a,b)=>Number.isFinite(n)&&n>=a&&n<=b;
const easing=e=>['linear','smooth','hold'].includes(e);
const png=a=>{
 if(!a)return true;
 if(typeof a.dataUrl!=='string'||a.dataUrl.length>380000||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(a.dataUrl))return false;
 const bytes=Buffer.from(a.dataUrl.slice(22),'base64');
 if(bytes.length<33||!Buffer.from([137,80,78,71,13,10,26,10]).equals(bytes.subarray(0,8))||bytes.toString('ascii',12,16)!=='IHDR')return false;
 const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);
 return w>=1&&w<=256&&h>=1&&h<=256&&a.width===w&&a.height===h&&(!a.name||typeof a.name==='string'&&a.name.length<=80)&&
  (a.size===undefined||finite(a.size,24,160))&&(a.scale===undefined||finite(a.scale,.5,4))&&(a.rotate===undefined||typeof a.rotate==='boolean');
};
const shots=list=>Array.isArray(list)&&list.length<=80&&new Set(list.map(g=>g?.id)).size===list.length&&list.every(g=>
 g&&typeof g.id==='string'&&g.id.length>0&&g.id.length<=48&&finite(g.angle,-Math.PI*8,Math.PI*8)&&finite(g.speed,.3,2.5)&&
 Number.isInteger(g.copies)&&finite(g.copies,1,48)&&finite(g.spread,0,360)&&finite(g.size,2,12)&&finite(g.spin,-5,5)&&finite(g.homing,0,8)&&
 ['pink','gold','cyan','violet'].includes(g.color)&&['fan','ring'].includes(g.mode));
const distinct=keys=>new Set(keys.map(k=>k.time)).size===keys.length;
export function validateLevel(level){
 if(!level||typeof level!=='object'||!Array.isArray(level.attacks)||level.attacks.length!==3||level.attacks.some(n=>!Number.isInteger(n)||n<0||n>14))return false;
 if(!Array.isArray(level.patterns)||level.patterns.length!==3||!png(level.assets?.boss)||!png(level.assets?.bullet))return false;
 if(!Number.isInteger(level.rank)||!finite(level.rank,0,34)||!finite(level.bulletSpeed,.65,1.8)||!finite(level.bossHp,300,5000))return false;
 if(level.timelineVersion===1)return level.custom===true&&level.patterns.every(p=>p&&finite(p.duration,.5,60)&&
  Array.isArray(p.keyframes)&&p.keyframes.length>=1&&p.keyframes.length<=64&&distinct(p.keyframes)&&p.keyframes.some(k=>k.time===0)&&p.keyframes.every(k=>
   k&&finite(k.time,0,p.duration)&&finite(k.cadence,18,120)&&easing(k.ease)&&['fixed','player'].includes(k.aim)&&shots(k.shots))&&
  Array.isArray(p.movement)&&p.movement.length>=1&&p.movement.length<=64&&distinct(p.movement)&&p.movement.some(k=>k.time===0)&&p.movement.every(k=>
   k&&finite(k.time,0,p.duration)&&finite(k.x,20,780)&&finite(k.y,20,580)&&finite(k.rotation||0,-1440,1440)&&easing(k.ease)));
 if(level.timelineVersion!==undefined)return false;
 return level.patterns.every(p=>p&&(Array.isArray(p.shots)?shots(p.shots.map((g,i)=>({id:'legacy-'+i,...g}))):
  ['fan','ring','spiral'].includes(p.shape)&&finite(+p.count,3,48)&&finite(+p.spread,.05,6)&&finite(+p.speed,.4,2.2)&&finite(+p.spin,-.04,.04)&&['pink','gold','cyan','violet'].includes(p.color)));
}
export {png as validatePNG};

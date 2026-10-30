// A deterministic bonus pack of 500 playable, unranked spell-card trials.
// They stay separate from the curated Dan ladder and its ranked star model.
(() => {
  'use strict';
  const lanes = [
    {skill:'JACK',theme:0}, {skill:'TECH',theme:1},
    {skill:'SPEED',theme:2}, {skill:'STAMINA',theme:3}
  ];
  const left = ['Glass','Moon','Paper','Violet','Clockwork','Comet','Silent','Crimson','Starlit','Prism','Distant','Silver','Neon','Winter','Falling','Solar','Marble','Velvet','Amber','Hollow'];
  const right = ['Current','Lattice','Refrain','Undertow','Garden','Crossing','Mirage','Orbit','Parade','Archive','Cascade','Pulse','Waltz','Spiral','Rain','Echo','Rift','Lantern','Crown','Tide','Ember','Signal','Petal','Night'];
  const colors = ['pink','cyan','gold','violet','white','orange'];
  const archive = Array.from({length:500},(_,index)=>{
    const number=index+1, volume=Math.floor(index/4)+1, lane=lanes[index%lanes.length];
    let state=(Math.imul(number,0x9e3779b1)^0x51a7c0de)>>>0;
    const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296};
    const rank=1+((volume-1)%34);
    const stars=rank<=1?1:rank<=20?1+10*(rank-1)/19:11+33*(rank-20)/14;
    const patterns=Array.from({length:3},(_,phase)=>({
      aim:random()<.15?'fixed':'player',
      cadence:Math.max(28,Math.round(82-rank*1.35+random()*17)),
      shots:Array.from({length:2+(random()*2|0)},()=>{
        const mode=random()<.34?'ring':'fan';
        return {
          angle:Math.round((random()-.5)*100),
          speed:Math.round((.72+random()*.68)*100)/100,
          color:colors[(number+phase+(random()*colors.length|0))%colors.length],
          size:3+(random()*4|0),
          homing:random()<.22?Math.round(random()*4*10)/10:0,
          spin:Math.round((random()-.5)*3*10)/10,
          copies:mode==='ring'?9+(random()*17|0):7+(random()*19|0),
          spread:mode==='ring'?360:35+(random()*105|0),
          mode
        };
      })
    }));
    const attacks=Array.from({length:3},()=>random()*15|0);
    return {
      id:'archive-'+String(number).padStart(3,'0'),
      title:left[(number*7+volume)%left.length]+' '+right[(number*11+rank)%right.length]+' · '+String(number).padStart(3,'0'),
      dan:'Archive Volume '+String(volume).padStart(3,'0'),skill:lane.skill,theme:lane.theme,
      rank,stars:Math.round(stars*100)/100,pressureRank:rank,attacks,patterns,cadence:Math.max(28,Math.round(82-rank*1.35)),
      bulletSpeed:Math.round((.88+random()*.35)*100)/100,bossHp:520+rank*38+(random()*180|0),
      generatedArchive:true,requires:[]
    };
  });
  window.STAR_SQUARE_ARCHIVE_LEVELS=archive;
  if(typeof window.SquareArchiveLoaded==='function')window.SquareArchiveLoaded();
  window.SquareArchiveUI={open({play,back,leaderboard}){
    const modal=document.getElementById('modal');let page=0,query='',skill='all';
    const escape=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    modal.classList.add('wide');
    const render=()=>{
      const rows=archive.filter(level=>(skill==='all'||level.skill===skill)&&(level.id+' '+level.title+' '+level.dan+' '+level.skill).toLowerCase().includes(query));
      const pages=Math.max(1,Math.ceil(rows.length/40));page=Math.min(page,pages-1);
      const visible=rows.slice(page*40,(page+1)*40);
      modal.innerHTML='<div class="treehead"><div><h1>GENERATED <span>ARCHIVE</span></h1><p>500 ranked trials across 125 volumes. Each map has its own per-level leaderboard and awards ranked PP. Stars follow the same Dan tier curve: 1★ through 11★ at Kappa, then up to 44★ at Omega.</p></div><div class="btnrow"><button class="btn" id="archiveBack">Song select</button></div></div><div class="songtools"><input id="archiveSearch" type="search" placeholder="Search title, volume, or map number" value="'+escape(query)+'"><select id="archiveSkill"><option value="all">All four lanes</option><option value="JACK" '+(skill==='JACK'?'selected':'')+'>JACK</option><option value="TECH" '+(skill==='TECH'?'selected':'')+'>TECH</option><option value="SPEED" '+(skill==='SPEED'?'selected':'')+'>SPEED</option><option value="STAMINA" '+(skill==='STAMINA'?'selected':'')+'>STAMINA</option></select><span class="pp-total">'+rows.length+' maps · page '+(page+1)+' / '+pages+'</span></div><div class="levelgrid">'+visible.map(level=>'<article class="levelnode"><small>'+escape(level.dan)+' · '+level.skill+' · ★ '+level.stars.toFixed(2)+' · RANKED</small><b>'+escape(level.title)+'</b><span>Three spell phases · '+level.attacks.map(x=>['Fan Needles','Star Ring','Triple Tap','Gold Spiral','Petal Wave','Crossfire','Twin Arc','Rotating Ring','Comet Stream','Curtain','Sidewinder','Lantern Fall','Clockwork','Homing Rain','Final Waltz'][x]).join(' · ')+'</span><div class="btnrow"><button class="btn primary" data-archive-play="'+level.id+'">Play map</button><button class="btn" data-archive-board="'+level.id+'">Leaderboard</button></div></article>').join('')+'</div><div class="btnrow"><button class="btn" id="archivePrev" '+(page===0?'disabled':'')+'>Previous</button><button class="btn" id="archiveNext" '+(page+1>=pages?'disabled':'')+'>Next</button></div>';
      document.getElementById('archiveBack').onclick=back;
      document.getElementById('archiveSearch').oninput=e=>{query=e.target.value.toLowerCase();page=0;render()};
      document.getElementById('archiveSkill').onchange=e=>{skill=e.target.value;page=0;render()};
      document.getElementById('archivePrev').onclick=()=>{page--;render()};
      document.getElementById('archiveNext').onclick=()=>{page++;render()};
      modal.querySelectorAll('[data-archive-play]').forEach(button=>button.onclick=()=>{const level=archive.find(item=>item.id===button.dataset.archivePlay);if(level)play(level)});
      modal.querySelectorAll('[data-archive-board]').forEach(button=>button.onclick=()=>leaderboard?.(button.dataset.archiveBoard));
    };
    render();
  }};
})();

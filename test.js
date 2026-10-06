const S = require('./sim.js');
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function draft(deck, pol){
  let pool=shuffle(deck), b=S.BUDGET, got=[];
  while(pool.length){ pool=pool.filter(id=>S.UNITS[id].cost<=b); if(!pool.length)break; const id=pool.shift(); const c=S.UNITS[id].cost;
    if(pol==='greedy'|| (pol==='pick'&&(c>=4||Math.random()<.5))) {b-=c;got.push(id);} }
  return got;
}
function run(deck,pol){
  let army=[];let reached=0;
  for(let w=1;w<=S.WAVES;w++){
    for(const id of draft(deck,pol)) {const m=Math.round(S.UNITS[id].hp);army.push({uid:Math.random(),id,hp:m,maxHp:m});}
    const st=S.createBattle(army,S.genEnemies(w));
    let n=0;while(!st.winner&&n++<5000)S.step(st,1/30);
    if(st.winner!=='p')return w-1;
    army=st.units.filter(u=>u.alive&&u.team==='p').map(u=>({uid:u.srcUid,id:u.id,hp:Math.min(u.maxHp,u.hp+u.maxHp*.4),maxHp:u.maxHp}));
  }
  return 5;
}
const decks={starter:['deckhand','raider','guard','archer','longbow','bomber','deckhand','archer'],
 all:S.ORDER.slice(), elite:['captain','elitebomb','cannon','mortar','sharp','grenadier','guard','raider'],
 cheap:['deckhand','deckhand','archer','archer','deckhand','archer','bomber','raider']};
for(const [n,d] of Object.entries(decks))for(const pol of['greedy','pick']){
 const r=[0,0,0,0,0,0];for(let i=0;i<300;i++)r[run(d,pol)]++;
 console.log(n.padEnd(8),pol.padEnd(7),'died@w1..w5, win:',r.map(x=>(x/3).toFixed(0)+'%').join(' '));}

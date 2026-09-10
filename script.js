const SHIPS = [
  {id:"carrier", name:"Porta-aviões", size:5},
  {id:"battleship", name:"Encouraçado", size:4},
  {id:"cruiser", name:"Cruzador", size:3},
  {id:"submarine", name:"Submarino", size:3},
  {id:"destroyer", name:"Contratorpedeiro", size:2}
];

let player = {ships: [], shots:new Set()};
let enemy = {ships: [], shots:new Set()};
let selectedShip = 0;
let horizontal = true;
let gameMode = "local";
let gameOver = false;

/* SONS — funciona mesmo se os WAV/MP3 da pasta sons falharem.
   Primeiro tenta os arquivos locais; se não carregar, usa sons gerados pelo navegador. */
const SOUND_FILES = {
  agua: ["sons/agua.wav", "sons/agua.mp3"],
  acerto: ["sons/acerto.wav", "sons/acerto.mp3"],
  afundado: ["sons/afundou.wav", "sons/afundado.wav", "sons/afundado.mp3"]
};
let soundContext = null;
let soundUnlocked = false;

function unlockSounds(){
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC) return;
    if(!soundContext) soundContext=new AC();
    if(soundContext.state === "suspended") soundContext.resume();
    soundUnlocked=true;
  }catch(e){}
}

function tone(freq, duration, type="sine", volume=0.16, delay=0){
  try{
    unlockSounds();
    if(!soundContext) return;
    const now=soundContext.currentTime+delay;
    const osc=soundContext.createOscillator();
    const gain=soundContext.createGain();
    osc.type=type;
    osc.frequency.setValueAtTime(freq,now);
    gain.gain.setValueAtTime(0.0001,now);
    gain.gain.exponentialRampToValueAtTime(volume,now+0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001,now+duration);
    osc.connect(gain); gain.connect(soundContext.destination);
    osc.start(now); osc.stop(now+duration+0.02);
  }catch(e){}
}

function playFallbackSound(name){
  if(name === "agua") {
    tone(180,0.12,"sine",0.12);
    tone(110,0.22,"sine",0.10,0.07);
  } else if(name === "acerto") {
    tone(520,0.10,"square",0.13);
    tone(760,0.16,"square",0.13,0.08);
  } else {
    tone(220,0.16,"sawtooth",0.12);
    tone(160,0.22,"sawtooth",0.12,0.12);
    tone(90,0.32,"sawtooth",0.12,0.25);
  }
}

const loadedSounds={};
function tryLoadSound(name){
  if(loadedSounds[name]) return loadedSounds[name];
  const paths=SOUND_FILES[name]||[];
  const audio=new Audio();
  audio.preload="auto";
  let n=0;
  const next=()=>{
    if(n>=paths.length) return;
    audio.src=new URL(paths[n++],document.baseURI).href;
    audio.load();
  };
  audio.addEventListener("error",next);
  next();
  loadedSounds[name]=audio;
  return audio;
}
["agua","acerto","afundado"].forEach(tryLoadSound);

function playSound(name){
  unlockSounds();
  const audio=loadedSounds[name];
  if(audio && audio.src){
    try{
      audio.currentTime=0;
      const p=audio.play();
      if(p && p.catch) p.catch(()=>playFallbackSound(name));
      return;
    }catch(e){}
  }
  playFallbackSound(name);
}

document.addEventListener("pointerdown",unlockSounds,{once:true,passive:true});
document.addEventListener("touchstart",unlockSounds,{once:true,passive:true});

(function injectShipStyles(){
  if(document.getElementById("ship-image-styles")) return;
  const style=document.createElement("style");
  style.id="ship-image-styles";
  style.textContent=`
    .board{position:relative;overflow:hidden;}
    .cell{position:relative;z-index:2;}
    .cell.ship{background:transparent!important;box-shadow:none!important;border-color:rgba(34,105,141,.55)!important;}
    .cell.preview{z-index:4;}
    .cell.ship.hit{background:#b32626!important;}
    .cell.ship.sunk{background:#7d1515!important;}
    .ship-image{position:absolute;z-index:1;object-fit:fill;pointer-events:none;filter:drop-shadow(0 2px 2px rgba(0,0,0,.55));}
    .ship-image.hit-image{filter:drop-shadow(0 2px 2px rgba(0,0,0,.65));}
  `;
  document.head.appendChild(style);
})();

function addShipImages(el, grid, revealShips){
  if(!el || !revealShips) return;

  const groups = {};
  for(let i=0;i<100;i++){
    const item=grid[i];
    if(item?.shipIndex !== undefined){
      if(!groups[item.shipIndex]) groups[item.shipIndex]=[];
      groups[item.shipIndex].push(i);
    }
  }

  Object.keys(groups).forEach(key=>{
    const shipIndex=Number(key);
    const positions=groups[shipIndex];
    const item=grid[positions[0]];
    const ship=SHIPS[shipIndex];
    if(!item || !ship || !SHIP_IMAGES[ship.id]) return;

    const cells=positions.map(i=>el.querySelector(`.cell[data-i="${i}"]`)).filter(Boolean);
    if(!cells.length) return;

    const first=cells[0];
    const last=cells[cells.length-1];
    const rowFirst=Math.floor(positions[0]/10);
    const rowLast=Math.floor(positions[positions.length-1]/10);
    const colFirst=positions[0]%10;
    const colLast=positions[positions.length-1]%10;
    const vertical=rowLast!==rowFirst;

    const left=Math.min(first.offsetLeft,last.offsetLeft);
    const top=Math.min(first.offsetTop,last.offsetTop);
    const right=Math.max(first.offsetLeft+first.offsetWidth,last.offsetLeft+last.offsetWidth);
    const bottom=Math.max(first.offsetTop+first.offsetHeight,last.offsetTop+last.offsetHeight);
    const spanW=right-left;
    const spanH=bottom-top;

    const img=document.createElement("img");
    img.className="ship-image" + (item.hit ? " hit-image" : "");
    img.alt=ship.name;
    img.draggable=false;
    img.src=SHIP_IMAGES[ship.id];

    if(vertical){
      img.style.width=spanH+"px";
      img.style.height=spanW+"px";
      // Centraliza a imagem pelo centro do conjunto de células antes da rotação.
      img.style.left=(left + spanW/2 - spanH/2)+"px";
      img.style.top=(top + spanH/2 - spanW/2)+"px";
      img.style.transform="rotate(90deg)";
    }else{
      img.style.left=left+"px";
      img.style.top=top+"px";
      img.style.width=spanW+"px";
      img.style.height=spanH+"px";
    }

    el.appendChild(img);
  });
}

const $ = id => document.getElementById(id);
const screens = ["home","setup","battle","help"];

function show(id){
  screens.forEach(s => {
    const el = $(s);
    if(el) el.classList.toggle("active", s === id);
  });
}

function addPlacementInfo(){
  const h = $("setupBoard");
  if(!h) return;

  let p = document.querySelector(".placement-info");
  if(!p){
    p = document.createElement("div");
    p.className = "placement-info";
    h.parentNode.insertBefore(p,h);
  }

  const remaining = SHIPS.filter((s,i) =>
    !player.ships.some(v => v?.shipIndex === i)
  );

  if(remaining.length){
    p.textContent =
      `Navio selecionado: ${SHIPS[selectedShip].name} • ${horizontal ? "Horizontal" : "Vertical"}`;
  }else{
    p.textContent = "Todos os navios posicionados. Inicie a batalha!";
  }
}

function renderFleet(){
  const fleet = $("fleet");
  if(!fleet) return;

  fleet.innerHTML = "";

  SHIPS.forEach((s,i)=>{
    const b = document.createElement("button");
    const placed = player.ships.some(v => v?.shipIndex === i);

    b.className =
      "ship-btn" +
      (i === selectedShip && !placed ? " selected" : "") +
      (placed ? " placed" : "");

    b.textContent = `${placed ? "✓ " : ""}${s.name} (${s.size})`;
    b.disabled = placed;

    b.onclick = () => {
      selectedShip = i;
      previewStart = null;
      renderFleet();
      renderSetup();
    };

    fleet.appendChild(b);
  });
}

/* Desenha um tabuleiro.
   revealShips=false esconde os navios do adversário. */
function renderBoard(el, grid, clickable=false, preview=[], revealShips=true){
  if(!el) return;

  el.innerHTML = "";

  for(let i=0;i<100;i++){
    const c = document.createElement("div");
    c.className = "cell";

    const item = grid[i];

    if(revealShips && item?.shipIndex !== undefined){
      c.classList.add("ship");
    }

    if(preview.includes(i)){
      c.classList.add("preview");
    }

    if(item?.hit){
      c.classList.add(item.sunk ? "sunk" : "hit");
      c.textContent = item.sunk ? "☠️" : "💥";
    }

    if(item?.miss){
      c.classList.add("miss");
      c.textContent = "💦";
    }

    c.dataset.i = i;

    if(clickable){
      c.onclick = () => handleEnemyShot(i);
    }

    el.appendChild(c);
  }

  // As imagens são adicionadas depois das células, mas ficam atrás delas.
  // O fundo das células ocupadas é transparente para o navio aparecer.
  addShipImages(el, grid, revealShips);
}

function cellsFor(index, isHorizontal, size){
  const r = Math.floor(index/10);
  const col = index % 10;
  const out = [];

  for(let n=0;n<size;n++){
    const rr = r + (isHorizontal ? 0 : n);
    const cc = col + (isHorizontal ? n : 0);

    if(rr > 9 || cc > 9) return null;

    out.push(rr * 10 + cc);
  }

  return out;
}

function canPlace(grid,cells){
  return !!cells && cells.every(i => !grid[i]);
}

function placeShip(state, shipIndex, start, isHorizontal=horizontal){
  const s = SHIPS[shipIndex];
  const cells = cellsFor(start,isHorizontal,s.size);

  if(!canPlace(state.ships,cells)) return false;

  cells.forEach(i => {
    state.ships[i] = {
      id:s.id,
      name:s.name,
      shipIndex
    };
  });

  return true;
}

function getPreview(){
  if(previewStart === null) return [];

  if(player.ships.some(v => v?.shipIndex === selectedShip)){
    return [];
  }

  const cells = cellsFor(
    previewStart,
    horizontal,
    SHIPS[selectedShip].size
  );

  return cells || [];
}

function previewIsValid(){
  const cells = getPreview();
  return canPlace(player.ships,cells);
}

function renderSetup(){
  const grid = Array(100).fill(null);

  player.ships.forEach((v,i)=>{
    if(v) grid[i] = v;
  });

  renderBoard(
    $("setupBoard"),
    grid,
    false,
    getPreview(),
    true
  );

  addPlacementInfo();

  const complete = SHIPS.every((s,i) =>
    player.ships.filter(v => v?.shipIndex === i).length === s.size
  );

  $("btnStart").disabled = !complete;
}

/* POSICIONAMENTO:
   1 toque = mostra a posição escolhida
   2º toque no mesmo quadrado = confirma
   outro toque = muda a posição da prévia */
$("setupBoard").addEventListener("click",e=>{
  const cell = e.target.closest(".cell");
  if(!cell) return;

  const i = Number(cell.dataset.i);

  if(player.ships.some(v => v?.shipIndex === selectedShip)){
    return;
  }

  if(previewStart === i){
    if(placeShip(player,selectedShip,i,horizontal)){
      previewStart = null;

      const next = SHIPS.findIndex((s,idx) =>
        !player.ships.some(v => v?.shipIndex === idx)
      );

      selectedShip = next >= 0 ? next : 0;

      renderFleet();
      renderSetup();
    }else{
      alert("⚠️ Não é possível colocar esse navio nessa posição. Tente outro lugar ou gire o navio.");
    }

    return;
  }

  previewStart = i;

  if(!previewIsValid()){
    renderSetup();
    alert("⚠️ O navio não cabe nessa posição ou está sobre outro navio.");
    return;
  }

  renderSetup();
});

$("btnRotate").onclick = ()=>{
  horizontal = !horizontal;

  if(previewStart !== null && !previewIsValid()){
    /* Se a rotação deixar a prévia inválida,
       ela continua sendo mostrada para o jogador
       entender o problema. */
  }

  renderSetup();
};

function randomFleet(){
  const state = {ships:[],shots:new Set()};

  SHIPS.forEach((s,si)=>{
    let ok = false;

    while(!ok){
      const dir = Math.random() < 0.5;
      const start = Math.floor(Math.random()*100);

      ok = placeShip(state,si,start,dir);
    }
  });

  return state;
}

function startBattle(){
  if(!SHIPS.every((s,i) =>
    player.ships.filter(v => v?.shipIndex === i).length === s.size
  )){
    alert("⚠️ Posicione todos os navios antes de iniciar.");
    return;
  }

  enemy = randomFleet();
  gameOver = false;

  renderBattle();

  $("statusLabel").textContent = "Sua vez";
  $("turnLabel").textContent = "Sua vez";

  show("battle");
}

function renderBattle(){
  /* IMPORTANTE:
     O tabuleiro ATAQUE não revela os navios do computador. */
  const enemyView = enemy.ships.map(v => {
    if(v?.sunk) return v;
    return v?.hit ? {hit:true} : (v?.miss ? v : undefined);
  });

  // Ataque: navios permanecem ocultos; apenas um navio já afundado pode aparecer.
  renderBoard(
    $("enemyBoard"),
    enemyView,
    true,
    [],
    true
  );

  /* Sua própria frota continua visível. */
  renderBoard(
    $("playerBoard"),
    player.ships,
    false,
    [],
    true
  );
}

function showSunkMessage(shipName){
  let box=document.getElementById("sunkMessage");
  if(!box){
    box=document.createElement("div"); box.id="sunkMessage";
    box.innerHTML=`<div class="sunk-card"><div class="sunk-icon">💥</div><div class="sunk-title">NAVIO INIMIGO AFUNDADO!</div><div class="sunk-name"></div></div>`;
    document.body.appendChild(box);
    const style=document.createElement("style");
    style.textContent=`#sunkMessage{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;pointer-events:none;background:rgba(0,10,20,.28);animation:sunkFade .2s ease-out}.sunk-card{width:min(88vw,390px);padding:24px 20px 22px;border-radius:22px;text-align:center;background:linear-gradient(145deg,#123e59,#061b2a);border:2px solid #55c7ff;box-shadow:0 16px 45px rgba(0,0,0,.55),inset 0 0 25px rgba(85,199,255,.12);transform:scale(.85);animation:sunkPop .35s cubic-bezier(.2,1.4,.4,1) forwards}.sunk-icon{font-size:54px;line-height:1;margin-bottom:8px}.sunk-title{font-size:clamp(25px,7vw,36px);font-weight:900;color:#fff;letter-spacing:1px}.sunk-name{margin-top:8px;font-size:18px;font-weight:700;color:#8edfff}@keyframes sunkPop{to{transform:scale(1)}}@keyframes sunkFade{from{opacity:0}to{opacity:1}}`;
    document.head.appendChild(style);
  }
  box.querySelector(".sunk-name").textContent=shipName; box.style.display="flex";
  clearTimeout(window.__sunkMessageTimer); window.__sunkMessageTimer=setTimeout(()=>box.style.display="none",1800);
}

function handleEnemyShot(i){
  if(gameOver || enemy.shots.has(i)) return;

  enemy.shots.add(i);

  const target = enemy.ships[i];

  if(target){
    target.hit = true;

    const sunk = checkSunk(enemy,target.shipIndex);

    if(sunk){
      enemy.ships.forEach(v=>{
        if(v?.shipIndex === target.shipIndex){
          v.sunk = true;
        }
      });

      playSound("afundado");
      renderBattle();
      showSunkMessage(`🚢 ${target.name} — ALVO DESTRUÍDO`);
    }else{
      playSound("acerto");
      renderBattle();
    }
  }else{
    playSound("agua");
    enemy.ships[i] = {miss:true};
    renderBattle();
  }

  if(allSunk(enemy)){
    finish("🏆 VOCÊ VENCEU!");
    return;
  }

  if(gameMode === "computer"){
    $("statusLabel").textContent = "Computador pensando...";
    $("turnLabel").textContent = "Vez do computador";

    setTimeout(computerTurn,700);
  }else{
    $("statusLabel").textContent = "Aguardando adversário";
    $("turnLabel").textContent = "Turno local";
  }
}

function computerTurn(){
  if(gameOver) return;

  let i;

  do{
    i = Math.floor(Math.random()*100);
  }while(player.shots.has(i));

  player.shots.add(i);

  if(player.ships[i]){
    player.ships[i].hit = true;

    const sunk = checkSunk(player,player.ships[i].shipIndex);

    if(sunk){
      player.ships.forEach(v=>{
        if(v?.shipIndex === player.ships[i].shipIndex){
          v.sunk = true;
        }
      });
      playSound("afundado");
    }else{
      playSound("acerto");
    }
  }else{
    playSound("agua");
    player.ships[i] = {miss:true};
  }

  renderBattle();

  if(allSunk(player)){
    finish("💀 COMPUTADOR VENCEU!");
    return;
  }

  $("statusLabel").textContent = "Sua vez";
  $("turnLabel").textContent = "Sua vez";
}

function checkSunk(state,shipIndex){
  const positions = [];

  state.ships.forEach(v=>{
    if(v?.shipIndex === shipIndex){
      positions.push(v);
    }
  });

  return positions.length > 0 && positions.every(v => v.hit);
}

function allSunk(state){
  return SHIPS.every((s,si)=>{
    const p = state.ships.filter(v => v?.shipIndex === si);
    return p.length === s.size && p.every(v => v.hit);
  });
}

function finish(msg){
  gameOver = true;

  $("statusLabel").textContent = msg;

  setTimeout(()=>{
    alert(msg);
  },50);
}

$("btnLocal").onclick = ()=>{
  gameMode = "local";
  player = {ships:[],shots:new Set()};
  enemy = {ships:[],shots:new Set()};
  selectedShip = 0;
  horizontal = true;
  previewStart = null;

  renderFleet();
  renderSetup();
  show("setup");
};

$("btnComputer").onclick = ()=>{
  gameMode = "computer";
  player = {ships:[],shots:new Set()};
  enemy = {ships:[],shots:new Set()};
  selectedShip = 0;
  horizontal = true;
  previewStart = null;

  renderFleet();
  renderSetup();
  show("setup");
};

$("btnBluetooth").onclick = ()=>{
  alert("📡 O modo Bluetooth será ativado na próxima etapa.");
};

$("btnHelp").onclick = ()=>show("help");
$("btnBackHelp").onclick = ()=>show("home");
$("btnBackSetup").onclick = ()=>show("home");
$("btnStart").onclick = startBattle;

$("btnRestart").onclick = ()=>{
  player = {ships:[],shots:new Set()};
  enemy = {ships:[],shots:new Set()};
  selectedShip = 0;
  horizontal = true;
  previewStart = null;
  gameOver = false;

  renderFleet();
  renderSetup();
  show("home");
};

renderFleet();
renderSetup();

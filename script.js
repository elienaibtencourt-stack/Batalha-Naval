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
let pendingStart = null;

const $ = id => document.getElementById(id);
const screens = ["home","setup","battle","help"];

function show(id){
  screens.forEach(s => $(s).classList.toggle("active", s===id));
}

function addPlacementInfo(){
  const h = $("setupBoard");
  let p = document.querySelector(".placement-info");
  if(!p){
    p=document.createElement("div");
    p.className="placement-info";
    h.parentNode.insertBefore(p,h);
  }

  const remaining=SHIPS.filter((s,i)=>
    !player.ships.some(v=>v?.shipIndex===i)
  );

  if(!remaining.length){
    p.textContent="Todos os navios posicionados. Inicie a batalha!";
    return;
  }

  p.textContent =
    `Navio selecionado: ${SHIPS[selectedShip].name} • ` +
    `${horizontal?"Horizontal":"Vertical"}` +
    (pendingStart!==null ? " • Toque novamente para confirmar" : "");
}

function renderFleet(){
  $("fleet").innerHTML = "";

  SHIPS.forEach((s,i)=>{
    const b=document.createElement("button");
    const placed=player.ships.some(v=>v?.shipIndex===i);

    b.className =
      "ship-btn" +
      (i===selectedShip&&!placed ? " selected" : "") +
      (placed ? " placed" : "");

    b.textContent=`${placed?"✓ ":""}${s.name} (${s.size})`;
    b.disabled=placed;

    b.onclick=()=>{
      selectedShip=i;
      pendingStart=null;
      renderFleet();
      renderSetup();
    };

    $("fleet").appendChild(b);
  });
}

function renderBoard(el, grid, clickable=false, preview=[], previewInvalid=[]){
  el.innerHTML="";

  for(let i=0;i<100;i++){
    const c=document.createElement("div");
    c.className="cell";

    if(grid[i]?.shipIndex !== undefined) c.classList.add("ship");

    if(preview.includes(i)) c.classList.add("preview");
    if(previewInvalid.includes(i)) c.classList.add("invalid");

    if(grid[i]?.hit) c.classList.add(grid[i].sunk?"sunk":"hit");
    if(grid[i]?.miss) c.classList.add("miss");

    c.dataset.i=i;

    if(clickable) c.onclick=()=>handleEnemyShot(i);

    el.appendChild(c);
  }
}

function cellsFor(index, isHorizontal, size){
  const r=Math.floor(index/10);
  const col=index%10;
  const out=[];

  for(let n=0;n<size;n++){
    const rr=r+(isHorizontal?0:n);
    const cc=col+(isHorizontal?n:0);

    if(rr>9 || cc>9) return null;

    out.push(rr*10+cc);
  }

  return out;
}

function canPlace(grid,cells){
  return !!cells && cells.every(i=>!grid[i]);
}

function placeShip(state, shipIndex, start, isHorizontal=horizontal){
  const s=SHIPS[shipIndex];
  const cells=cellsFor(start,isHorizontal,s.size);

  if(!canPlace(state.ships,cells)) return false;

  cells.forEach(i=>{
    state.ships[i]={
      id:s.id,
      name:s.name,
      shipIndex
    };
  });

  return true;
}

function getPreview(){
  if(pendingStart===null) return [];

  if(player.ships.some(v=>v?.shipIndex===selectedShip)) return [];

  return cellsFor(
    pendingStart,
    horizontal,
    SHIPS[selectedShip].size
  ) || [];
}

function getInvalidPreview(){
  if(pendingStart===null) return [];

  const cells=cellsFor(
    pendingStart,
    horizontal,
    SHIPS[selectedShip].size
  );

  if(!cells || !canPlace(player.ships,cells)){
    if(cells) return cells;

    const result=[];
    const r=Math.floor(pendingStart/10);
    const col=pendingStart%10;

    for(let n=0;n<SHIPS[selectedShip].size;n++){
      const rr=r+(horizontal?0:n);
      const cc=col+(horizontal?n:0);

      if(rr>=0 && rr<=9 && cc>=0 && cc<=9)
        result.push(rr*10+cc);
    }

    return result;
  }

  return [];
}

function renderSetup(){
  const grid=Array(100).fill(null);
  player.ships.forEach((v,i)=>{
    if(v) grid[i]=v;
  });

  renderBoard(
    $("setupBoard"),
    grid,
    false,
    getPreview(),
    getInvalidPreview()
  );

  addPlacementInfo();

  const complete=SHIPS.every((s,i)=>
    player.ships.filter(v=>v?.shipIndex===i).length===s.size
  );

  $("btnStart").disabled=!complete;
}

$("setupBoard").addEventListener("click",e=>{
  const cell=e.target.closest(".cell");
  if(!cell) return;

  const i=Number(cell.dataset.i);

  if(player.ships.some(v=>v?.shipIndex===selectedShip))
    return;

  // Primeiro toque: escolhe exatamente esta posição e mostra a prévia.
  if(pendingStart===null){
    pendingStart=i;
    renderSetup();
    return;
  }

  // Toque em outra posição: move a prévia para essa posição.
  if(pendingStart!==i){
    pendingStart=i;
    renderSetup();
    return;
  }

  // Segundo toque na mesma posição: confirma.
  if(placeShip(player,selectedShip,pendingStart,horizontal)){
    pendingStart=null;

    const next=SHIPS.findIndex((s,idx)=>
      !player.ships.some(v=>v?.shipIndex===idx)
    );

    if(next>=0) selectedShip=next;

    renderFleet();
    renderSetup();
  }else{
    alert("⚠️ Essa posição não é válida. Escolha outra casa ou gire o navio.");
    renderSetup();
  }
});

$("btnRotate").onclick=()=>{
  horizontal=!horizontal;
  renderSetup();
};

function randomFleet(){
  const state={ships:[],shots:new Set()};

  SHIPS.forEach((s,si)=>{
    let ok=false;

    while(!ok){
      const dir=Math.random()<.5;
      const start=Math.floor(Math.random()*100);
      ok=placeShip(state,si,start,dir);
    }
  });

  return state;
}

function startBattle(){
  enemy=randomFleet();
  gameOver=false;
  renderBattle();

  $("statusLabel").textContent="Sua vez";
  $("turnLabel").textContent="Sua vez";
  show("battle");
}

function renderBattle(){
  renderBoard($("enemyBoard"), enemy.ships, true);
  renderBoard($("playerBoard"), player.ships);
}

function handleEnemyShot(i){
  if(gameOver || enemy.shots.has(i)) return;

  enemy.shots.add(i);
  const target=enemy.ships[i];

  if(target){
    target.hit=true;

    const sunk=checkSunk(enemy,target.shipIndex);

    if(sunk){
      enemy.ships.forEach(v=>{
        if(v?.shipIndex===target.shipIndex) v.sunk=true;
      });

      alert(`💥 ${target.name} afundou!`);
    }
  }else{
    enemy.ships[i]={miss:true};
  }

  renderBattle();

  if(allSunk(enemy)){
    finish("🏆 VOCÊ VENCEU!");
    return;
  }

  if(gameMode==="computer"){
    $("statusLabel").textContent="Computador pensando...";
    setTimeout(computerTurn,500);
  }else{
    $("statusLabel").textContent="Aguardando adversário";
    $("turnLabel").textContent="Turno local";
  }
}

function computerTurn(){
  let i;

  do{
    i=Math.floor(Math.random()*100);
  }while(player.shots.has(i));

  player.shots.add(i);

  if(player.ships[i])
    player.ships[i].hit=true;
  else
    player.ships[i]={miss:true};

  renderBattle();

  if(allSunk(player)){
    finish("💀 COMPUTADOR VENCEU!");
    return;
  }

  $("statusLabel").textContent="Sua vez";
  $("turnLabel").textContent="Sua vez";
}

function checkSunk(state,shipIndex){
  const positions=[];

  state.ships.forEach(v=>{
    if(v?.shipIndex===shipIndex) positions.push(v);
  });

  return positions.length>0 && positions.every(v=>v.hit);
}

function allSunk(state){
  return SHIPS.every((s,si)=>{
    const p=state.ships.filter(v=>v?.shipIndex===si);
    return p.length===s.size && p.every(v=>v.hit);
  });
}

function finish(msg){
  gameOver=true;
  $("statusLabel").textContent=msg;
  setTimeout(()=>alert(msg),50);
}

$("btnLocal").onclick=()=>{
  gameMode="local";
  player={ships:[],shots:new Set()};
  enemy={ships:[],shots:new Set()};
  selectedShip=0;
  horizontal=true;
  pendingStart=null;

  renderFleet();
  renderSetup();
  show("setup");
};

$("btnComputer").onclick=()=>{
  gameMode="computer";
  player={ships:[],shots:new Set()};
  enemy={ships:[],shots:new Set()};
  selectedShip=0;
  horizontal=true;
  pendingStart=null;

  renderFleet();
  renderSetup();
  show("setup");
};

$("btnBluetooth").onclick=()=>{
  alert("📡 O modo Bluetooth será ativado na próxima etapa.");
};

$("btnHelp").onclick=()=>show("help");
$("btnBackHelp").onclick=()=>show("home");
$("btnBackSetup").onclick=()=>show("home");
$("btnStart").onclick=startBattle;
$("btnRestart").onclick=()=>show("home");

renderFleet();
renderSetup();

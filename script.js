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
let selectedStart = null;
let gameMode = "local";
let gameOver = false;

const $ = id => document.getElementById(id);
const screens = ["home","setup","battle","help"];

function show(id){
  screens.forEach(s => $(s).classList.toggle("active", s===id));
}

function shipPlaced(shipIndex){
  return player.ships.some(v => v?.shipIndex === shipIndex);
}

function addPlacementInfo(){
  const h = $("setupBoard");
  let p = document.querySelector(".placement-info");
  if(!p){
    p = document.createElement("div");
    p.className = "placement-info";
    h.parentNode.insertBefore(p,h);
  }

  const remaining = SHIPS.filter((s,i) => !shipPlaced(i));
  if(!remaining.length){
    p.textContent = "Todos os navios posicionados. Inicie a batalha!";
    return;
  }

  const action = selectedStart === null
    ? "Toque em uma casa do tabuleiro"
    : "Toque novamente para confirmar";

  p.textContent = `Navio selecionado: ${SHIPS[selectedShip].name} • ${horizontal ? "Horizontal" : "Vertical"} • ${action}`;
}

function renderFleet(){
  $("fleet").innerHTML = "";
  SHIPS.forEach((s,i)=>{
    const b = document.createElement("button");
    const placed = shipPlaced(i);
    b.className = "ship-btn" + (i===selectedShip && !placed ? " selected" : "") + (placed ? " placed" : "");
    b.textContent = `${placed ? "✓ " : ""}${s.name} (${s.size})`;
    b.disabled = placed;
    b.onclick = () => {
      selectedShip = i;
      selectedStart = null;
      renderFleet();
      renderSetup();
    };
    $("fleet").appendChild(b);
  });
}

function renderBoard(el, grid, clickable=false, preview=[]){
  el.innerHTML = "";
  for(let i=0;i<100;i++){
    const c = document.createElement("div");
    c.className = "cell";

    if(grid[i]?.shipIndex !== undefined) c.classList.add("ship");
    if(preview.includes(i)) c.classList.add("preview");
    if(grid[i]?.hit) c.classList.add(grid[i].sunk ? "sunk" : "hit");
    if(grid[i]?.miss) c.classList.add("miss");

    c.dataset.i = i;
    if(clickable) c.onclick = () => handleEnemyShot(i);
    el.appendChild(c);
  }
}

function cellsFor(index, isHorizontal, size){
  if(index === null || index === undefined) return null;

  const r = Math.floor(index/10);
  const col = index % 10;
  const out = [];

  for(let n=0;n<size;n++){
    const rr = r + (isHorizontal ? 0 : n);
    const cc = col + (isHorizontal ? n : 0);
    if(rr > 9 || cc > 9) return null;
    out.push(rr*10 + cc);
  }
  return out;
}

function canPlace(grid,cells){
  return Array.isArray(cells) && cells.length > 0 && cells.every(i => !grid[i]);
}

function placeShip(state, shipIndex, start, isHorizontal=horizontal){
  const s = SHIPS[shipIndex];
  const cells = cellsFor(start,isHorizontal,s.size);
  if(!canPlace(state.ships,cells)) return false;

  cells.forEach(i => {
    state.ships[i] = {id:s.id,name:s.name,shipIndex};
  });
  return true;
}

function getPreview(){
  if(shipPlaced(selectedShip) || selectedStart === null) return [];
  const cells = cellsFor(selectedStart,horizontal,SHIPS[selectedShip].size);
  return canPlace(player.ships,cells) ? cells : cells || [];
}

function renderSetup(){
  const grid = Array(100).fill(null);
  player.ships.forEach((v,i) => { if(v) grid[i] = v; });
  renderBoard($("setupBoard"),grid,false,getPreview());
  addPlacementInfo();

  const complete = SHIPS.every((s,i) =>
    player.ships.filter(v => v?.shipIndex === i).length === s.size
  );
  $("btnStart").disabled = !complete;
}

$("setupBoard").addEventListener("click",e=>{
  const cell = e.target.closest(".cell");
  if(!cell) return;

  const i = Number(cell.dataset.i);
  if(shipPlaced(selectedShip)) return;

  // Primeiro toque: escolhe exatamente esta casa como início do navio.
  if(selectedStart === null){
    const cells = cellsFor(i,horizontal,SHIPS[selectedShip].size);
    if(!canPlace(player.ships,cells)){
      alert("⚠️ O navio não cabe nessa posição. Escolha outra casa ou gire o navio.");
      return;
    }
    selectedStart = i;
    renderSetup();
    return;
  }

  // Toque em outra casa: move a prévia para a nova posição.
  if(i !== selectedStart){
    const cells = cellsFor(i,horizontal,SHIPS[selectedShip].size);
    if(!canPlace(player.ships,cells)){
      alert("⚠️ O navio não cabe nessa posição. Escolha outra casa ou gire o navio.");
      return;
    }
    selectedStart = i;
    renderSetup();
    return;
  }

  // Segundo toque na mesma casa: confirma o posicionamento.
  if(placeShip(player,selectedShip,selectedStart,horizontal)){
    selectedStart = null;
    const next = SHIPS.findIndex((s,idx) => !shipPlaced(idx));
    selectedShip = next >= 0 ? next : 0;
    renderFleet();
    renderSetup();
  }else{
    alert("⚠️ Não é possível colocar esse navio nessa posição.");
    selectedStart = null;
    renderSetup();
  }
});

$("btnRotate").onclick = () => {
  horizontal = !horizontal;

  // Mantém a casa escolhida e apenas muda a orientação.
  if(selectedStart !== null){
    const cells = cellsFor(selectedStart,horizontal,SHIPS[selectedShip].size);
    if(!canPlace(player.ships,cells)){
      // Se a rotação não couber, não muda a orientação.
      horizontal = !horizontal;
      alert("⚠️ Não é possível girar o navio nessa posição.");
      return;
    }
  }
  renderSetup();
};

function randomFleet(){
  const state = {ships:[],shots:new Set()};

  SHIPS.forEach((s,si)=>{
    let ok = false;
    while(!ok){
      const isHorizontal = Math.random() < .5;
      const start = Math.floor(Math.random()*100);
      ok = placeShip(state,si,start,isHorizontal);
    }
  });
  return state;
}

function startBattle(){
  if(!SHIPS.every((s,i) => player.ships.filter(v=>v?.shipIndex===i).length===s.size)){
    alert("⚠️ Posicione todos os navios antes de iniciar a batalha.");
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
  // No ataque, os navios inimigos ficam escondidos até serem atingidos.
  const enemyView = Array(100).fill(null);
  for(let i=0;i<100;i++){
    const v = enemy.ships[i];
    if(v?.hit) enemyView[i] = v;
    else if(v?.miss) enemyView[i] = v;
  }
  renderBoard($("enemyBoard"),enemyView,true);
  renderBoard($("playerBoard"),player.ships);
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
        if(v?.shipIndex===target.shipIndex) v.sunk=true;
      });
      alert(`💥 ${target.name} afundou!`);
    }else{
      alert("🎯 ACERTOU!");
    }
  }else{
    enemy.ships[i] = {miss:true};
  }

  renderBattle();

  if(allSunk(enemy)){
    finish("🏆 VOCÊ VENCEU!");
    return;
  }

  if(gameMode === "computer"){
    $("statusLabel").textContent = "Computador pensando...";
    $("turnLabel").textContent = "Aguarde";
    setTimeout(computerTurn,500);
  }else{
    $("statusLabel").textContent = "Aguardando adversário";
    $("turnLabel").textContent = "Turno local";
  }
}

function computerTurn(){
  let i;
  do{
    i = Math.floor(Math.random()*100);
  }while(player.shots.has(i));

  player.shots.add(i);
  if(player.ships[i]){
    player.ships[i].hit = true;
    const target = player.ships[i];
    if(checkSunk(player,target.shipIndex)){
      player.ships.forEach(v=>{
        if(v?.shipIndex===target.shipIndex) v.sunk=true;
      });
    }
  }else{
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
    if(v?.shipIndex===shipIndex) positions.push(v);
  });
  return positions.length>0 && positions.every(v=>v.hit);
}

function allSunk(state){
  return SHIPS.every((s,si)=>{
    const p = state.ships.filter(v=>v?.shipIndex===si);
    return p.length===s.size && p.every(v=>v.hit);
  });
}

function finish(msg){
  gameOver = true;
  $("statusLabel").textContent = msg;
  setTimeout(()=>alert(msg),50);
}

function newGame(mode){
  gameMode = mode;
  player = {ships:[],shots:new Set()};
  enemy = {ships:[],shots:new Set()};
  selectedShip = 0;
  horizontal = true;
  selectedStart = null;
  gameOver = false;
  renderFleet();
  renderSetup();
  show("setup");
}

$("btnLocal").onclick = () => newGame("local");
$("btnComputer").onclick = () => newGame("computer");

$("btnBluetooth").onclick = () => {
  alert("📡 O modo Bluetooth será ativado na próxima etapa.");
};

$("btnHelp").onclick = () => show("help");
$("btnBackHelp").onclick = () => show("home");
$("btnBackSetup").onclick = () => show("home");
$("btnStart").onclick = startBattle;
$("btnRestart").onclick = () => show("home");

renderFleet();
renderSetup();

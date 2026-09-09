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

/* Posição escolhida para o próximo navio.
   O primeiro toque mostra a prévia.
   O segundo toque no mesmo lugar confirma. */
let previewStart = null;

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
  renderBoard(
    $("enemyBoard"),
    enemy.ships,
    true,
    [],
    false
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

      renderBattle();
      alert(`💥 ${target.name} AFUNDOU!`);
    }else{
      renderBattle();
    }
  }else{
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

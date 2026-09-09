const SHIPS = [
  {id:"carrier", name:"Porta-aviões", size:5},
  {id:"battleship", name:"Encouraçado", size:4},
  {id:"cruiser", name:"Cruzador", size:3},
  {id:"submarine", name:"Submarino", size:3},
  {id:"destroyer", name:"Contratorpedeiro", size:2}
];

let player = {ships:[], shots:new Set()};
let enemy = {ships:[], shots:new Set()};
let selectedShip = 0;
let horizontal = true;
let gameMode = "local";
let gameOver = false;

const $ = id => document.getElementById(id);
const screens = ["home","setup","battle","help"];

function show(id){
  screens.forEach(s => $(s).classList.toggle("active", s===id));
}

function emptyGrid(){ return Array(100).fill(null); }

function renderFleet(){
  $("fleet").innerHTML = "";
  SHIPS.forEach((s,i)=>{
    const b=document.createElement("button");
    b.className="ship-btn"+(i===selectedShip?" selected":"");
    b.textContent=`${s.name} (${s.size})`;
    b.onclick=()=>{selectedShip=i; renderFleet(); renderSetup();};
    $("fleet").appendChild(b);
  });
}

function renderBoard(el, grid, clickable=false, preview=[]){
  el.innerHTML="";
  for(let i=0;i<100;i++){
    const c=document.createElement("div");
    c.className="cell";
    if(grid[i]) c.classList.add("ship");
    if(preview.includes(i)) c.classList.add("preview");
    if(grid[i]?.hit) c.classList.add(grid[i].sunk?"sunk":"hit");
    if(grid[i]?.miss) c.classList.add("miss");
    c.dataset.i=i;
    if(clickable)c.onclick=()=>handleEnemyShot(i);
    el.appendChild(c);
  }
}

function cellsFor(index, horizontal, size){
  const r=Math.floor(index/10), col=index%10, out=[];
  for(let n=0;n<size;n++){
    const rr=r+(horizontal?0:n), cc=col+(horizontal?n:0);
    if(rr>9||cc>9)return null;
    out.push(rr*10+cc);
  }
  return out;
}

function canPlace(grid,cells){
  return cells && cells.every(i=>!grid[i]);
}

function placeShip(state, shipIndex, start){
  const s=SHIPS[shipIndex], cells=cellsFor(start,horizontal,s.size);
  if(!canPlace(state.ships,cells)) return false;
  cells.forEach(i=>state.ships[i]={id:s.id,name:s.name,shipIndex});
  return true;
}

function renderSetup(){
  const grid=emptyGrid();
  player.ships.forEach((v,i)=>grid[i]=v);
  const preview=cellsFor(findEmptyStart(),horizontal,SHIPS[selectedShip].size)||[];
  renderBoard($("setupBoard"),grid,false,preview);
}

function findEmptyStart(){
  for(let i=0;i<100;i++){
    const cells=cellsFor(i,horizontal,SHIPS[selectedShip].size);
    if(canPlace(player.ships,cells))return i;
  }
  return 0;
}

$("setupBoard").addEventListener("click",e=>{
  const cell=e.target.closest(".cell"); if(!cell)return;
  const i=Number(cell.dataset.i);
  if(placeShip(player,selectedShip,i)){
    selectedShip++;
    if(selectedShip>=SHIPS.length)selectedShip=SHIPS.length-1;
    renderFleet(); renderSetup();
    $("btnStart").disabled=SHIPS.every((s,idx)=>player.ships.filter(x=>x?.shipIndex===idx).length===s.size)===false;
  }
});

$("btnRotate").onclick=()=>{horizontal=!horizontal;renderSetup()};

function randomFleet(){
  const state={ships:[],shots:new Set()};
  SHIPS.forEach((s,si)=>{
    let ok=false;
    while(!ok){
      horizontal=Math.random()<.5;
      const start=Math.floor(Math.random()*100);
      ok=placeShip(state,si,start);
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
  if(gameOver || enemy.shots.has(i))return;
  enemy.shots.add(i);
  const target=enemy.ships[i];
  if(target){
    target.hit=true;
    const sunk=checkSunk(enemy,target.shipIndex);
    if(sunk) alert(`💥 ${target.name} afundou!`);
  }else{
    enemy.ships[i]={miss:true};
  }
  renderBattle();
  if(allSunk(enemy)){finish("🏆 VOCÊ VENCEU!");return;}
  if(gameMode==="computer") setTimeout(computerTurn,500);
  else{
    $("statusLabel").textContent="Aguardando adversário";
    $("turnLabel").textContent="Turno local";
  }
}

function computerTurn(){
  let i;
  do{i=Math.floor(Math.random()*100)}while(player.shots.has(i));
  player.shots.add(i);
  if(player.ships[i])player.ships[i].hit=true;
  else player.ships[i]={miss:true};
  renderBattle();
  if(allSunk(player)){finish("💀 COMPUTADOR VENCEU!");return;}
  $("statusLabel").textContent="Sua vez";
  $("turnLabel").textContent="Sua vez";
}

function checkSunk(state,shipIndex){
  const positions=[];
  state.ships.forEach((v,i)=>{if(v?.shipIndex===shipIndex)positions.push(v)});
  return positions.every(v=>v.hit);
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
  gameMode="local"; player={ships:[],shots:new Set()}; selectedShip=0; horizontal=true;
  renderFleet(); renderSetup(); $("btnStart").disabled=true; show("setup");
};
$("btnComputer").onclick=()=>{
  gameMode="computer"; player={ships:[],shots:new Set()}; selectedShip=0; horizontal=true;
  renderFleet(); renderSetup(); $("btnStart").disabled=true; show("setup");
};
$("btnBluetooth").onclick=()=>alert("📡 Modo Bluetooth será ativado na próxima etapa. A estrutura do jogo já está preparada para receber a comunicação entre dois celulares.");
$("btnHelp").onclick=()=>show("help");
$("btnBackHelp").onclick=()=>show("home");
$("btnBackSetup").onclick=()=>show("home");
$("btnStart").onclick=startBattle;
$("btnRestart").onclick=()=>show("home");

renderFleet();
renderSetup();

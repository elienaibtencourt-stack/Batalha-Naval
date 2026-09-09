const SHIPS = [
  {id:"carrier", name:"Porta-aviões", size:5},
  {id:"battleship", name:"Encouraçado", size:4},
  {id:"cruiser", name:"Cruzador", size:3},
  {id:"submarine", name:"Submarino", size:3},
  {id:"destroyer", name:"Contratorpedeiro", size:2}
];

let player = {
  ships: [],
  shots: new Set(),
  _previewStart: null
};

let enemy = {
  ships: [],
  shots: new Set()
};

let selectedShip = 0;
let horizontal = true;
let gameMode = "local";
let gameOver = false;

const $ = id => document.getElementById(id);

const screens = ["home","setup","battle","help"];

function show(id){
  screens.forEach(s => {
    $(s).classList.toggle("active", s === id);
  });
}


/* =====================================================
   INFORMAÇÕES DO POSICIONAMENTO
   ===================================================== */

function addPlacementInfo(){

  const h = $("setupBoard");

  let p = document.querySelector(".placement-info");

  if(!p){
    p = document.createElement("div");
    p.className = "placement-info";
    h.parentNode.insertBefore(p,h);
  }

  const remaining = SHIPS.filter(
    (s,i) => !player.ships.some(v => v?.shipIndex === i)
  );

  if(remaining.length){

    p.textContent =
      `Navio selecionado: ${SHIPS[selectedShip].name} • ` +
      `${horizontal ? "Horizontal" : "Vertical"}`;

  }else{

    p.textContent =
      "Todos os navios posicionados. Inicie a batalha!";

  }
}


/* =====================================================
   LISTA DE NAVIOS
   ===================================================== */

function renderFleet(){

  $("fleet").innerHTML = "";

  SHIPS.forEach((s,i)=>{

    const b = document.createElement("button");

    const placed =
      player.ships.some(v => v?.shipIndex === i);

    b.className =
      "ship-btn" +
      (i === selectedShip && !placed ? " selected" : "") +
      (placed ? " placed" : "");

    b.textContent =
      `${placed ? "✓ " : ""}${s.name} (${s.size})`;

    b.disabled = placed;

    b.onclick = ()=>{

      selectedShip = i;

      // Quando escolher outro navio,
      // começa uma nova prévia
      player._previewStart = null;

      renderFleet();
      renderSetup();

    };

    $("fleet").appendChild(b);

  });
}


/* =====================================================
   TABULEIRO
   ===================================================== */

function renderBoard(el, grid, clickable = false, preview = []){

  el.innerHTML = "";

  for(let i = 0; i < 100; i++){

    const c = document.createElement("div");

    c.className = "cell";

    if(grid[i]?.shipIndex !== undefined){
      c.classList.add("ship");
    }

    if(preview.includes(i)){
      c.classList.add("preview");
    }

    if(grid[i]?.hit){
      c.classList.add(
        grid[i].sunk ? "sunk" : "hit"
      );
    }

    if(grid[i]?.miss){
      c.classList.add("miss");
    }

    c.dataset.i = i;

    if(clickable){
      c.onclick = () => handleEnemyShot(i);
    }

    el.appendChild(c);

  }
}


/* =====================================================
   CALCULA AS CASAS DO NAVIO
   ===================================================== */

function cellsFor(index, horizontal, size){

  const r = Math.floor(index / 10);
  const col = index % 10;

  const out = [];

  for(let n = 0; n < size; n++){

    const rr =
      r + (horizontal ? 0 : n);

    const cc =
      col + (horizontal ? n : 0);

    // Saiu do tabuleiro
    if(rr > 9 || cc > 9){
      return null;
    }

    out.push(rr * 10 + cc);

  }

  return out;
}


/* =====================================================
   VERIFICA SE PODE COLOCAR
   ===================================================== */

function canPlace(grid,cells){

  return !!cells &&
    cells.every(i => !grid[i]);

}


/* =====================================================
   COLOCA NAVIO
   ===================================================== */

function placeShip(state,shipIndex,start){

  const s = SHIPS[shipIndex];

  const cells =
    cellsFor(
      start,
      horizontal,
      s.size
    );

  if(!canPlace(state.ships,cells)){
    return false;
  }

  cells.forEach(i => {

    state.ships[i] = {
      id: s.id,
      name: s.name,
      shipIndex: shipIndex
    };

  });

  return true;
}


/* =====================================================
   PRÉVIA DO NAVIO
   ===================================================== */

function getPreview(){

  // Se já foi colocado, não mostra prévia
  if(
    player.ships.some(
      v => v?.shipIndex === selectedShip
    )
  ){
    return [];
  }

  // Nenhuma posição escolhida ainda
  if(
    player._previewStart === null ||
    player._previewStart === undefined
  ){
    return [];
  }

  const ship = SHIPS[selectedShip];

  if(!ship){
    return [];
  }

  const cells =
    cellsFor(
      player._previewStart,
      horizontal,
      ship.size
    );

  // Se a posição for inválida,
  // ainda mostramos as casas calculadas
  // para o jogador perceber o problema.
  return cells || [];
}


/* =====================================================
   RENDERIZA TELA DE POSICIONAMENTO
   ===================================================== */

function renderSetup(){

  const grid = Array(100).fill(null);

  player.ships.forEach((v,i)=>{

    if(v){
      grid[i] = v;
    }

  });

  renderBoard(
    $("setupBoard"),
    grid,
    false,
    getPreview()
  );

  addPlacementInfo();

  const complete =
    SHIPS.every((s,i) =>
      player.ships.filter(
        v => v?.shipIndex === i
      ).length === s.size
    );

  $("btnStart").disabled = !complete;

}


/* =====================================================
   CLIQUE NO TABULEIRO PARA POSICIONAR
   ===================================================== */

$("setupBoard").addEventListener("click",e=>{

  const cell = e.target.closest(".cell");

  if(!cell){
    return;
  }

  const i = Number(cell.dataset.i);


  // Não permite mexer em navio já colocado
  if(
    player.ships.some(
      v => v?.shipIndex === selectedShip
    )
  ){
    return;
  }


  /*
     PRIMEIRO TOQUE

     Apenas escolhe a posição.
     O navio aparece como prévia.
  */

  if(
    player._previewStart === null ||
    player._previewStart !== i
  ){

    player._previewStart = i;

    renderSetup();

    return;
  }


  /*
     SEGUNDO TOQUE NA MESMA CASA

     Confirma o posicionamento.
  */

  if(
    placeShip(
      player,
      selectedShip,
      i
    )
  ){

    player._previewStart = null;


    // Procura o próximo navio ainda não colocado
    const next =
      SHIPS.findIndex(
        (s,idx) =>
          !player.ships.some(
            v => v?.shipIndex === idx
          )
      );

    selectedShip =
      next >= 0 ? next : 0;

    renderFleet();
    renderSetup();

  }else{

    $("statusLabel").textContent =
      "⚠️ Não é possível colocar esse navio nessa posição.";

    setTimeout(()=>{
      $("statusLabel").textContent = "";
    },1500);

  }

});


/* =====================================================
   GIRAR NAVIO
   ===================================================== */

$("btnRotate").onclick = ()=>{

  horizontal = !horizontal;

  // Mantém a posição escolhida
  // e apenas muda a direção.

  renderSetup();

};


/* =====================================================
   FROTA ALEATÓRIA
   ===================================================== */

function randomFleet(){

  const state = {
    ships: [],
    shots: new Set()
  };

  SHIPS.forEach((s,si)=>{

    let ok = false;

    while(!ok){

      horizontal =
        Math.random() < 0.5;

      const start =
        Math.floor(
          Math.random() * 100
        );

      ok =
        placeShip(
          state,
          si,
          start
        );

    }

  });

  return state;
}


/* =====================================================
   INICIA BATALHA
   ===================================================== */

function startBattle(){

  enemy = randomFleet();

  gameOver = false;

  renderBattle();

  $("statusLabel").textContent =
    "Sua vez";

  $("turnLabel").textContent =
    "Sua vez";

  show("battle");

}


/* =====================================================
   RENDERIZA BATALHA
   ===================================================== */

function renderBattle(){

  renderBoard(
    $("enemyBoard"),
    enemy.ships,
    true
  );

  renderBoard(
    $("playerBoard"),
    player.ships
  );

}


/* =====================================================
   TIRO NO INIMIGO
   ===================================================== */

function handleEnemyShot(i){

  if(
    gameOver ||
    enemy.shots.has(i)
  ){
    return;
  }

  enemy.shots.add(i);

  const target =
    enemy.ships[i];


  // ACERTO
  if(target){

    target.hit = true;

    const sunk =
      checkSunk(
        enemy,
        target.shipIndex
      );

    if(sunk){

      enemy.ships.forEach(v=>{

        if(
          v?.shipIndex ===
          target.shipIndex
        ){
          v.sunk = true;
        }

      });

      alert(
        `💥 ${target.name} afundou!`
      );

    }

  }

  // ERRO
  else{

    enemy.ships[i] = {
      miss: true
    };

  }


  renderBattle();


  // Vitória
  if(allSunk(enemy)){

    finish(
      "🏆 VOCÊ VENCEU!"
    );

    return;
  }


  // Computador
  if(gameMode === "computer"){

    setTimeout(
      computerTurn,
      500
    );

  }else{

    $("statusLabel").textContent =
      "Aguardando adversário";

    $("turnLabel").textContent =
      "Turno local";

  }

}


/* =====================================================
   VEZ DO COMPUTADOR
   ===================================================== */

function computerTurn(){

  let i;

  do{

    i =
      Math.floor(
        Math.random() * 100
      );

  }while(
    player.shots.has(i)
  );


  player.shots.add(i);


  if(player.ships[i]){

    player.ships[i].hit = true;

  }else{

    player.ships[i] = {
      miss: true
    };

  }


  renderBattle();


  if(allSunk(player)){

    finish(
      "💀 COMPUTADOR VENCEU!"
    );

    return;

  }


  $("statusLabel").textContent =
    "Sua vez";

  $("turnLabel").textContent =
    "Sua vez";

}


/* =====================================================
   VERIFICA SE NAVIO AFUNDOU
   ===================================================== */

function checkSunk(state,shipIndex){

  const positions = [];

  state.ships.forEach(v=>{

    if(
      v?.shipIndex === shipIndex
    ){
      positions.push(v);
    }

  });

  return (
    positions.length > 0 &&
    positions.every(
      v => v.hit
    )
  );

}


/* =====================================================
   VERIFICA SE TODA A FROTA AFUNDOU
   ===================================================== */

function allSunk(state){

  return SHIPS.every((s,si)=>{

    const p =
      state.ships.filter(
        v => v?.shipIndex === si
      );

    return (
      p.length === s.size &&
      p.every(v => v.hit)
    );

  });

}


/* =====================================================
   FINALIZA JOGO
   ===================================================== */

function finish(msg){

  gameOver = true;

  $("statusLabel").textContent =
    msg;

  setTimeout(
    () => alert(msg),
    50
  );

}


/* =====================================================
   JOGAR LOCAL
   ===================================================== */

$("btnLocal").onclick = ()=>{

  gameMode = "local";

  player = {
    ships: [],
    shots: new Set(),
    _previewStart: null
  };

  enemy = {
    ships: [],
    shots: new Set()
  };

  selectedShip = 0;

  horizontal = true;

  renderFleet();
  renderSetup();

  show("setup");

};


/* =====================================================
   CONTRA COMPUTADOR
   ===================================================== */

$("btnComputer").onclick = ()=>{

  gameMode = "computer";

  player = {
    ships: [],
    shots: new Set(),
    _previewStart: null
  };

  enemy = {
    ships: [],
    shots: new Set()
  };

  selectedShip = 0;

  horizontal = true;

  renderFleet();
  renderSetup();

  show("setup");

};


/* =====================================================
   BLUETOOTH
   ===================================================== */

$("btnBluetooth").onclick = ()=>{

  alert(
    "📡 O modo Bluetooth será ativado na próxima etapa."
  );

};


/* =====================================================
   COMO JOGAR
   ===================================================== */

$("btnHelp").onclick =
  () => show("help");

$("btnBackHelp").onclick =
  () => show("home");

$("btnBackSetup").onclick =
  () => show("home");


/* =====================================================
   BOTÕES DA BATALHA
   ===================================================== */

$("btnStart").onclick =
  startBattle;

$("btnRestart").onclick =
  () => show("home");


/* =====================================================
   INICIALIZAÇÃO
   ===================================================== */

renderFleet();

renderSetup();

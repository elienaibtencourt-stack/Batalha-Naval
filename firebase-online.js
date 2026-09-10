// Firebase multiplayer layer for Batalha Naval MB
(function(){
  const FB_CONFIG = {
    apiKey: "AIzaSyD671mWcD3TlsS27msmeU4uiruSPKO1Shw",
    authDomain: "batalha-naval-mb.firebaseapp.com",
    projectId: "batalha-naval-mb",
    databaseURL: "https://batalha-naval-mb-default-rtdb.firebaseio.com",
    storageBucket: "batalha-naval-mb.firebasestorage.app",
    messagingSenderId: "1496716654",
    appId: "1:1496716654:web:de8e37979fb46196da5d7f"
  };

  let db = null;
  let roomCode = null;
  let role = null; // p1 / p2
  let roomRef = null;
  let roomListener = null;
  let lastProcessedIncomingMove = null;
  let lastProcessedOwnMove = null;
  let onlineReady = false;

  function setBtStatus(msg){
    const el = document.getElementById('btStatus');
    if(el) el.textContent = msg;
  }

  function setOnlineStatus(msg){
    const el = document.getElementById('statusLabel');
    if(el) el.textContent = msg;
  }

  function makeCode(){
    const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code='';
    for(let i=0;i<6;i++) code += chars[Math.floor(Math.random()*chars.length)];
    return code;
  }

  function cloneShips(ships){
    return JSON.parse(JSON.stringify(ships || []));
  }

  function playerData(){
    return {ready:false, ships:cloneShips(player.ships)};
  }

  function myPath(){ return role === 'p1' ? 'player1' : 'player2'; }
  function opponentPath(){ return role === 'p1' ? 'player2' : 'player1'; }

  function ensureFirebase(){
    if(db) return true;
    try{
      if(!window.firebase || !firebase.initializeApp){
        setBtStatus('Firebase não carregou. Verifique a conexão com a internet.');
        return false;
      }
      if(!firebase.apps.length) firebase.initializeApp(FB_CONFIG);
      db = firebase.database();
      return true;
    }catch(err){
      console.error(err);
      setBtStatus('Erro ao iniciar o Firebase.');
      return false;
    }
  }

  async function createRoom(){
    if(!ensureFirebase()) return;
    gameMode = 'online';
    role = 'p1';
    roomCode = makeCode();
    roomRef = db.ref('rooms/' + roomCode);
    try{
      const snap = await roomRef.once('value');
      if(snap.exists()) return createRoom();
      await roomRef.set({
        status:'waiting',
        player1:playerData(),
        player2:null,
        turn:null,
        move:null,
        winner:null,
        createdAt:firebase.database.ServerValue.TIMESTAMP
      });
      listenRoom();
      setBtStatus('PARTIDA CRIADA • CÓDIGO: ' + roomCode + ' • Aguardando o outro jogador...');
    }catch(err){
      console.error(err);
      setBtStatus('Não foi possível criar a partida.');
    }
  }

  async function joinRoom(){
    if(!ensureFirebase()) return;
    const code = (prompt('Digite o código da partida (6 caracteres):') || '').trim().toUpperCase();
    if(!/^[A-Z0-9]{6}$/.test(code)){
      setBtStatus('Código inválido. Use os 6 caracteres mostrados no outro celular.');
      return;
    }
    const ref = db.ref('rooms/' + code);
    try{
      const snap = await ref.once('value');
      if(!snap.exists()){
        setBtStatus('Partida não encontrada. Confira o código.');
        return;
      }
      const room = snap.val();
      if(room.player2){
        setBtStatus('Essa partida já possui dois jogadores.');
        return;
      }
      gameMode = 'online';
      role = 'p2';
      roomCode = code;
      roomRef = ref;
      await roomRef.child('player2').set(playerData());
      resetForOnlineSetup();
      listenRoom();
      setBtStatus('ENTROU NA PARTIDA ' + roomCode + ' • Agora posicione sua frota.');
    }catch(err){
      console.error(err);
      setBtStatus('Não foi possível entrar na partida.');
    }
  }

  function resetForOnlineSetup(){
    player = {ships:[],shots:new Set()};
    enemy = {ships:[],shots:new Set()};
    selectedShip = 0;
    horizontal = true;
    previewStart = null;
    gameOver = false;
    renderFleet();
    renderSetup();
    // IMPORTANTE: a tela ONLINE (#bluetooth) também tem a classe .screen.
    // A função show() antiga não a removia, deixando ONLINE visível por cima
    // da tela de preparação. No modo online, escondemos todas as telas
    // explicitamente e mostramos somente SETUP.
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    document.getElementById('setup')?.classList.add('active');
    setOnlineStatus('Posicione sua frota');
  }

  function listenRoom(){
    if(!roomRef) return;
    if(roomListener) roomRef.off('value', roomListener);
    roomListener = function(snapshot){
      const room = snapshot.val();
      if(!room) return;
      handleRoomUpdate(room);
    };
    roomRef.on('value', roomListener);
  }

  function allShipsPlaced(){
    return SHIPS.every((s,i)=>player.ships.filter(v=>v?.shipIndex===i).length===s.size);
  }

  async function sendReady(){
    if(!roomRef || !allShipsPlaced()) return;
    const data = {ready:true, ships:cloneShips(player.ships)};
    await roomRef.child(myPath()).set(data);
    setOnlineStatus('Frota pronta • aguardando o adversário');
  }

  function handleRoomUpdate(room){
    if(room.status === 'finished' && room.winner){
      const won = room.winner === role;
      gameOver = true;
      setOnlineStatus(won ? '🏆 VOCÊ VENCEU!' : '💀 VOCÊ PERDEU!');
      return;
    }

    const me = room[myPath()];
    const opp = room[opponentPath()];

    if(opp && opp.ships && gameMode === 'online'){
      enemy.ships = cloneShips(opp.ships);
    }


    // IMPORTANTE: verificar primeiro se os dois jogadores estão prontos.
    // No código anterior o bloco "waiting" fazia return antes desta verificação,
    // impedindo a partida de mudar para "playing".
    if(room.player1?.ready && room.player2?.ready && room.status !== 'playing' && room.status !== 'finished'){
      roomRef.update({status:'playing', turn: room.turn || 'p1'}).catch(console.error);
      return;
    }

    if(room.status === 'waiting'){
      if(room.player2){
        // Os dois celulares devem permanecer/entrar na tela de posicionamento.
        // Não apagar uma frota já montada.
        if(document.getElementById('setup')?.classList.contains('active')){
          renderFleet();
          renderSetup();
        }else{
          showOnlineSetup();
        }
        setBtStatus('PARTIDA ' + roomCode + ' • segundo jogador conectado. Posicione sua frota.');
        setOnlineStatus(allShipsPlaced() ? 'Frota pronta • aguardando o adversário' : 'Posicione sua frota');
      }else if(role === 'p1'){
        setBtStatus('PARTIDA ' + roomCode + ' • código para o outro celular: ' + roomCode);
      }
      return;
    }

    if(room.status === 'playing'){
      if(document.getElementById('setup')?.classList.contains('active')){
        if(allShipsPlaced()) renderSetup();
        renderBattle();
        show('battle');
      }
      const myTurn = room.turn === role;
      setOnlineStatus(myTurn ? 'Sua vez' : 'Vez do adversário');
      processMove(room);
    }
  }

  function processMove(room){
    const move = room.move;
    if(!move) return;

    if(move.status === 'pending' && move.by !== role && lastProcessedIncomingMove !== move.id){
      lastProcessedIncomingMove = move.id;
      resolveIncomingMove(move);
      return;
    }

    if(move.status === 'resolved' && move.by === role && lastProcessedOwnMove !== move.id){
      lastProcessedOwnMove = move.id;
      applyResolvedMove(move);
    }
  }

  async function resolveIncomingMove(move){
    if(!roomRef || gameOver) return;
    const target = player.ships[move.index];
    let result = 'miss';
    let shipIndex = null;
    let shipName = null;

    if(target && target.shipIndex !== undefined){
      target.hit = true;
      shipIndex = target.shipIndex;
      shipName = target.name;
      const sunk = checkSunk(player, shipIndex);
      if(sunk){
        player.ships.forEach(v=>{ if(v?.shipIndex===shipIndex) v.sunk=true; });
        result = 'sunk';
        playSound('afundado');
      }else{
        result = 'hit';
        playSound('acerto');
      }
    }else{
      if(!player.ships[move.index]) player.ships[move.index] = {miss:true};
      result = 'miss';
      playSound('agua');
    }

    const lost = allSunk(player);
    const update = {};
    update['player1/ships'] = role === 'p1' ? cloneShips(player.ships) : undefined;
    update['player2/ships'] = role === 'p2' ? cloneShips(player.ships) : undefined;
    if(update['player1/ships'] === undefined) delete update['player1/ships'];
    if(update['player2/ships'] === undefined) delete update['player2/ships'];
    update['move/status'] = 'resolved';
    update['move/result'] = result;
    update['move/shipIndex'] = shipIndex;
    update['move/shipName'] = shipName;
    update['move/at'] = firebase.database.ServerValue.TIMESTAMP;
    if(lost){
      update.status = 'finished';
      update.winner = move.by;
      update.turn = move.by;
    }else{
      update.turn = move.by;
    }
    await roomRef.update(update);
    renderBattle();
    if(lost) setOnlineStatus('💀 Sua frota foi destruída');
  }

  function applyResolvedMove(move){
    const idx = Number(move.index);
    if(move.result === 'miss'){
      enemy.ships[idx] = {miss:true};
      playSound('agua');
    }else{
      const target = enemy.ships[idx] || {};
      target.hit = true;
      if(move.result === 'sunk'){
        enemy.ships.forEach(v=>{ if(v?.shipIndex === move.shipIndex) v.sunk=true; });
        playSound('afundado');
        showSunkMessage('🚢 ' + (move.shipName || 'Navio') + ' — ALVO DESTRUÍDO');
      }else{
        playSound('acerto');
      }
      enemy.ships[idx] = target;
    }
    renderBattle();
    if(move.result === 'sunk'){
      setOnlineStatus('Vez do adversário');
    }else{
      setOnlineStatus('Vez do adversário');
    }
  }

  async function onlineAttack(index){
    if(gameOver || !roomRef || !onlineReady) return;
    const snap = await roomRef.once('value');
    const room = snap.val();
    if(!room || room.status !== 'playing' || room.turn !== role) return;
    if(room.move?.status === 'pending') return;
    if(enemy.shots.has(index)) return;
    enemy.shots.add(index);
    const move = {
      id: role + '-' + Date.now() + '-' + Math.random().toString(36).slice(2,7),
      by: role,
      index:index,
      status:'pending',
      at:firebase.database.ServerValue.TIMESTAMP
    };
    lastProcessedOwnMove = null;
    await roomRef.child('move').set(move);
    setOnlineStatus('Disparo enviado • aguardando resultado');
  }

  function startOnlineBattle(){
    if(!allShipsPlaced()){
      alert('⚠️ Posicione todos os navios antes de iniciar.');
      return;
    }
    onlineReady = true;
    sendReady().catch(console.error);
  }

  function patchBattleClicks(){
    if(typeof renderBoard !== 'function') return;
    // renderBoard usa handleEnemyShot como callback. Mantemos Local/Computador intactos.
    const originalHandleEnemyShot = handleEnemyShot;
    handleEnemyShot = function(i){
      if(gameMode === 'online') return onlineAttack(i);
      return originalHandleEnemyShot(i);
    };
  }

  function install(){
    const btnBt = document.getElementById('btnBluetooth');
    const bt = document.getElementById('bluetooth');
    const screens = Array.from(document.querySelectorAll('.screen'));
    const home = document.getElementById('home');
    if(!btnBt || !bt) return;

    btnBt.onclick = function(e){
      e.preventDefault();
      screens.forEach(s=>s.classList.remove('active'));
      bt.classList.add('active');
      setBtStatus('Escolha criar ou entrar em uma partida pela internet.');
    };

    const create = document.getElementById('btnBtCreate');
    const join = document.getElementById('btnBtJoin');
    const back = document.getElementById('btnBtBack');
    if(create) create.onclick = createRoom;
    if(join) join.onclick = joinRoom;
    if(back) back.onclick = function(){ screens.forEach(s=>s.classList.remove('active')); home.classList.add('active'); };

    const oldStart = document.getElementById('btnStart');
    if(oldStart) oldStart.onclick = function(){
      if(gameMode === 'online') startOnlineBattle();
      else startBattle();
    };

    const restart = document.getElementById('btnRestart');
    if(restart){
      const originalRestart = restart.onclick;
      restart.onclick = function(){
        if(gameMode === 'online'){
          if(roomRef && roomListener) roomRef.off('value', roomListener);
          roomRef = null; roomListener = null; roomCode = null; role = null; onlineReady = false;
          gameMode = 'local';
          show('home');
          return;
        }
        if(originalRestart) originalRestart();
      };
    }

    const backSetup = document.getElementById('btnBackSetup');
    if(backSetup){
      const originalBack = backSetup.onclick;
      backSetup.onclick = function(){
        if(gameMode === 'online'){
          setBtStatus('Você saiu da tela de preparação. A partida continua no Firebase.');
          document.querySelectorAll('.screen').forEach(el=>el.classList.remove('active'));
          document.getElementById('bluetooth')?.classList.add('active');
          return;
        }
        if(originalBack) originalBack();
      };
    }

    patchBattleClicks();
  }

  window.addEventListener('load', function(){
    // Compat SDK é carregado antes deste arquivo pela página.
    install();
  });
})();

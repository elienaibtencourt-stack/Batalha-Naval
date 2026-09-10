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
      // O criador permanece na tela ONLINE para visualizar e informar o código.
      // Quando o segundo jogador entrar, handleRoomUpdate() levará o P1 para a preparação.
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

  function bindOnlineStartButton(){
    const b = document.getElementById('btnStart');
    if(!b) return;
    b.onclick = function(e){
      e.preventDefault();
      e.stopPropagation();
      if(gameMode === 'online') startOnlineBattle();
      else if(typeof startBattle === 'function') startBattle();
    };
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
    bindOnlineStartButton();
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
    if(!roomRef) {
      setBtStatus('ERRO: partida online não está conectada.');
      return false;
    }
    if(!allShipsPlaced()){
      setBtStatus('Posicione todos os navios antes de iniciar.');
      return false;
    }
    const data = {ready:true, ships:cloneShips(player.ships)};
    setBtStatus('Confirmando sua frota...');
    await roomRef.child(myPath()).update(data);
    onlineReady = true;
    const b = document.getElementById('btnStart');
    if(b) { b.disabled = true; b.textContent = '✓ FROTA CONFIRMADA'; }
    setOnlineStatus('Frota pronta • aguardando o adversário');
    setBtStatus('Frota confirmada! Aguardando o outro jogador...');
    return true;
  }

  // Renderizador próprio do modo ONLINE.
  // Não depende do renderBattle() do script.js, garantindo que os dois
  // tabuleiros sejam desenhados e que o tabuleiro ATAQUE receba os toques.
  function renderOnlineBoard(el, grid, clickable, revealShips){
    if(!el) return;
    el.innerHTML = '';
    el.style.display='grid';
    el.style.gridTemplateColumns='repeat(10, minmax(0, 1fr))';
    el.style.gridTemplateRows='repeat(10, minmax(0, 1fr))';
    el.style.gap='2px';
    el.style.padding='6px';
    el.style.boxSizing='border-box';
    for(let i=0;i<100;i++){
      const c=document.createElement('div');
      c.className='cell';
      c.style.boxSizing='border-box';
      c.style.width='100%';
      c.style.aspectRatio='1 / 1';
      c.style.minWidth='0';
      c.style.border='1px solid rgba(255,255,255,.28)';
      c.style.background='rgba(0,120,180,.28)';
      c.style.display='flex';
      c.style.alignItems='center';
      c.style.justifyContent='center';
      c.style.fontSize='clamp(14px,4vw,24px)';
      c.style.borderRadius='3px';
      const item=grid[i];
      if(revealShips && item && item.shipIndex !== undefined) c.classList.add('ship');
      if(item?.hit) c.classList.add(item.sunk ? 'sunk' : 'hit');
      if(item?.miss) c.classList.add('miss');
      if(item?.hit) c.textContent=item.sunk ? '☠️' : '💥';
      if(item?.miss) c.textContent='💦';
      c.dataset.i=String(i);
      if(clickable){
        c.style.cursor='pointer';
        c.addEventListener('click',function(e){
          e.preventDefault();
          e.stopPropagation();
          onlineAttack(i);
        });
      }
      el.appendChild(c);
    }
  }

  function renderOnlineBattle(){
    const enemyView=(enemy && Array.isArray(enemy.ships)) ? enemy.ships.map(v=>{
      if(v?.sunk) return v;
      if(v?.hit) return {hit:true};
      if(v?.miss) return {miss:true};
      return undefined;
    }) : [];
    const own=(player && Array.isArray(player.ships)) ? player.ships : [];
    renderOnlineBoard(document.getElementById('enemyBoard'),enemyView,true,false);
    renderOnlineBoard(document.getElementById('playerBoard'),own,false,true);
  }

  function enterOnlineBattle(room){
    onlineReady = true;
    gameOver = false;
    if(room && room[opponentPath()]?.ships){
      enemy.ships = cloneShips(room[opponentPath()].ships);
    }
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    const battle = document.getElementById('battle');
    if(battle) battle.classList.add('active');
    try { renderOnlineBattle(); } catch(err) {
      console.error('Erro ao renderizar batalha:', err);
      setBtStatus('Batalha iniciada, mas houve erro ao montar o tabuleiro.');
    }
    const myTurn = room?.turn === role;
    setOnlineStatus(myTurn ? 'Sua vez' : 'Vez do adversário');
    if(room) processMove(room);
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

    if(me?.ready) onlineReady = true;

    if(opp && opp.ships && gameMode === 'online'){
      // Atualiza a frota adversária sem apagar os tiros que EU já fiz.
      // O Firebase guarda a posição dos navios, enquanto os resultados dos
      // meus tiros ficam no estado local deste celular.
      const previousShots = enemy && enemy.shots instanceof Set ? new Set(enemy.shots) : new Set();
      const base = cloneShips(opp.ships);
      previousShots.forEach(i => {
        if(base[i]) base[i].hit = true;
        else base[i] = {miss:true};
      });
      enemy.ships = base;
      enemy.shots = previousShots;
    }
    if(room.status === 'playing'){
      if(!document.getElementById('battle')?.classList.contains('active')){
        enterOnlineBattle(room);
        return;
      }
      try { renderOnlineBattle(); } catch(e) { console.error(e); }
      // Atualiza a indicação da vez em ambos os celulares a cada mudança.
      setOnlineStatus(room.turn === role ? 'Sua vez' : 'Vez do adversário');
      // IMPORTANTE: cada alteração no Firebase precisa processar também
      // o disparo recebido ou o resultado do nosso próprio disparo.
      // Sem isso o tiro é gravado, mas nunca é resolvido no outro celular.
      processMove(room);
    }

    // PRIMEIRO: se os dois já confirmaram a frota, iniciar a batalha.
    // Isso precisa acontecer antes do bloco "waiting", pois a sala ainda
    // pode estar com status waiting no instante em que o segundo jogador
    // toca em INICIAR BATALHA.
    if(room.player1?.ready && room.player2?.ready && room.status !== 'playing' && room.status !== 'finished'){
      onlineReady = true;
      const turn = room.turn || 'p1';
      // Muda a sala e, imediatamente após a confirmação do Firebase,
      // abre a tela de batalha neste celular também. Assim nenhum dos
      // aparelhos depende de um novo evento/recarregamento para iniciar.
      roomRef.update({status:'playing', turn:turn}).then(()=>{
        enterOnlineBattle({...room, status:'playing', turn:turn});
      }).catch(err=>{
        console.error(err);
        setOnlineStatus('Erro ao iniciar a batalha online.');
        setBtStatus('Erro ao iniciar a batalha: ' + (err.message || err));
      });
      return;
    }

    if(room.status === 'waiting'){
      if(room.player2){
        // Não redesenhar continuamente a tela de preparação se ela já está
        // aberta; isso evita que o botão INICIAR BATALHA seja recriado ou
        // volte ao estado desabilitado durante a sincronização.
        const setupActive = document.getElementById('setup')?.classList.contains('active');
        if(!setupActive){
          resetForOnlineSetup();
        }else{
          const b = document.getElementById('btnStart');
          if(b) b.disabled = false;
        }
        setBtStatus('PARTIDA ' + roomCode + ' • segundo jogador conectado. Posicione sua frota.');
        if(me?.ready){
          setOnlineStatus('Frota pronta • aguardando o adversário');
        }else{
          setOnlineStatus(allShipsPlaced() ? 'Frota pronta • toque em INICIAR BATALHA' : 'Posicione sua frota');
        }
      }else if(role === 'p1'){
        setBtStatus('PARTIDA ' + roomCode + ' • código para o outro celular: ' + roomCode);
      }
      return;
    }

    if(room.status === 'playing'){
      onlineReady = true;
      enterOnlineBattle(room);
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
    // Só o jogador atingido resolve o disparo. O próprio Firebase garante
    // que o campo 'by' identifica quem disparou.
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
      // Depois que o adversário recebeu nosso tiro, a vez passa para
      // quem foi atingido (o jogador desta função).
      update.turn = role;
    }
    await roomRef.update(update);
    renderOnlineBattle();
    if(lost) setOnlineStatus('💀 Sua frota foi destruída');
    else setOnlineStatus('Sua vez');
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
    renderOnlineBattle();
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
    // Mantém a informação de turno imediatamente neste aparelho.
    setOnlineStatus('Disparo enviado • aguardando resultado');
    renderOnlineBattle();
  }

  async function startOnlineBattle(){
    const complete = allShipsPlaced();
    const b = document.getElementById('btnStart');
    if(!complete){
      if(b) b.disabled = false;
      alert('⚠️ Posicione todos os navios antes de iniciar.');
      return;
    }
    if(b) b.disabled = false;
    if(!roomRef || !role){
      setOnlineStatus('Partida online não está conectada.');
      return;
    }
    onlineReady = true;
    try{
      // Confirma a frota deste jogador diretamente no Firebase.
      await roomRef.child(myPath()).update({
        ready:true,
        ships:cloneShips(player.ships)
      });
      setOnlineStatus('Frota pronta • aguardando o adversário');
      setBtStatus('✓ Frota confirmada! Aguardando o outro jogador...');
      const info = document.querySelector('#setup .placement-info');
      if(info) info.textContent = '✓ Frota confirmada! Aguardando o outro jogador iniciar.';
      if(b){ b.disabled = true; b.textContent = '✓ FROTA CONFIRMADA'; }

      // Verifica imediatamente se o adversário também já confirmou.
      // Assim a partida não depende apenas do próximo evento do listener.
      const snap = await roomRef.once('value');
      const room = snap.val();
      if(room && room.player1?.ready && room.player2?.ready && room.status !== 'finished'){
        const turn = room.turn || 'p1';
        await roomRef.update({status:'playing', turn:turn});
        enterOnlineBattle({...room, status:'playing', turn:turn});
      }else{
        setBtStatus('Frota confirmada! Aguardando o outro jogador confirmar.');
      }
    }catch(err){
      console.error(err);
      onlineReady = false;
      setOnlineStatus('Erro ao confirmar a frota. Tente novamente.');
    }
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

    // O botão é religado aqui e também sempre que a tela de preparação
    // online é aberta, garantindo o funcionamento nos dois celulares.
    bindOnlineStartButton();

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

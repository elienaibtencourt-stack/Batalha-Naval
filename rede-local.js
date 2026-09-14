/*
 * Batalha Naval MB — Rede Local (Etapa 2)
 * Comunicação direta por WebRTC DataChannel, sem Firebase, sem Bluetooth.
 * O módulo é independente do modo 🌐 JOGAR ONLINE.
 */
(function(){
  'use strict';

  let pc = null;
  let channel = null;
  let role = null;
  let connected = false;
  let myFleetSent = false;
  let opponentFleet = null;
  let started = false;
  const $ = id => document.getElementById(id);

  function setStatus(text){
    const el=$('localStatus');
    if(el) el.textContent=text;
  }

  function setScreen(id){
    document.querySelectorAll('.screen').forEach(el=>el.classList.remove('active'));
    const el=$(id); if(el) el.classList.add('active');
  }

  function resetUI(){
    ['localHostArea','localJoinArea','localMessageArea'].forEach(id=>{
      const el=$(id); if(el) el.hidden=true;
    });
    if($('localOffer')) $('localOffer').value='';
    if($('localAnswerInput')) $('localAnswerInput').value='';
    if($('localOfferInput')) $('localOfferInput').value='';
    if($('localAnswer')) $('localAnswer').value='';
    if($('localReceived')) $('localReceived').textContent='Nenhuma mensagem recebida ainda.';
    if($('localRoleStep')) $('localRoleStep').textContent='Escolha quem vai iniciar a conexão.';
    setStatus('Aguardando escolha.');
    myFleetSent=false;
    opponentFleet=null;
    started=false;
  }

  function closeConnection(){
    connected=false;
    try{ if(channel) channel.close(); }catch(e){}
    try{ if(pc) pc.close(); }catch(e){}
    channel=null; pc=null; role=null;
    myFleetSent=false; opponentFleet=null; started=false;
    window.__bnLocalMyTurn=false;
  }

  function requireWebRTC(){
    if(!window.RTCPeerConnection){
      setStatus('❌ Este aplicativo/WebView não oferece suporte ao WebRTC.');
      return false;
    }
    return true;
  }

  function waitIceComplete(peer){
    if(peer.iceGatheringState==='complete') return Promise.resolve();
    return new Promise(resolve=>{
      let done=false;
      const finish=()=>{if(done)return;done=true;peer.removeEventListener('icegatheringstatechange',check);resolve();};
      const check=()=>{if(peer.iceGatheringState==='complete')finish();};
      peer.addEventListener('icegatheringstatechange',check);
      setTimeout(finish,5000);
    });
  }

  function encode(obj){ return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))); }
  function decode(text){
    try{return JSON.parse(decodeURIComponent(escape(atob(text.trim()))));}
    catch(e){throw new Error('Código inválido ou incompleto.');}
  }

  function send(data){
    if(channel && channel.readyState==='open') channel.send(JSON.stringify(data));
  }

  function maybeStart(){
    if(started || !myFleetSent || !opponentFleet) return;
    started=true;
    const myTurn = role==='host';
    window.BNLocalCore.startBattle(opponentFleet, myTurn);
    setStatus(myTurn ? '⚓ Batalha local iniciada. Sua vez.' : '⚓ Batalha local iniciada. Vez do adversário.');
  }

  function handleMessage(raw){
    let data;
    try{ data=JSON.parse(raw); }catch(_){ return; }

    if(data.type==='fleet_ready'){
      opponentFleet=data.fleet;
      setStatus('🚢 Frota do adversário recebida.');
      maybeStart();
      return;
    }

    if(data.type==='shot'){
      const result=window.BNLocalCore.receiveShot(Number(data.index));
      if(!result) return;
      send({type:'shot_result',index:Number(data.index),result});
      if(result.gameOver){
        started=false;
        setStatus('💀 Sua frota foi destruída.');
      }else{
        window.BNLocalCore.opponentShotResolved();
      }
      return;
    }

    if(data.type==='shot_result'){
      window.BNLocalCore.applyShotResult(Number(data.index),data.result);
      if(data.result?.gameOver){
        started=false;
        setStatus('🏆 Você destruiu a frota adversária!');
      }
      return;
    }
  }

  function wireChannel(ch){
    channel=ch;
    channel.onopen=()=>{
      connected=true;
      if($('localMessageArea')) $('localMessageArea').hidden=true;
      if($('localRoleStep')) $('localRoleStep').textContent='✅ Conexão pronta. Os dois podem posicionar suas frotas.';
      setStatus('✅ CONEXÃO ESTABELECIDA! Agora os dois celulares devem posicionar a frota.');
      // A navegação para a tela de posicionamento é feita aqui,
      // independentemente do módulo principal do jogo.
      setScreen('setup');
      if(window.BNLocalCore) window.BNLocalCore.enterSetup();
      prepareLocalBattleUI();
    };
    channel.onclose=()=>{
      connected=false;
      setStatus('⚠️ A conexão foi encerrada.');
    };
    channel.onerror=()=>setStatus('❌ Erro no canal de comunicação.');
    channel.onmessage=e=>handleMessage(e.data);
  }

  async function createHost(){
    if(!requireWebRTC()) return;
    closeConnection(); role='host'; resetUI();
    $('localHostArea').hidden=false;
    $('localRoleStep').textContent='Celular 1: gere o código e envie para o celular 2.';
    setStatus('⏳ Gerando conexão local...');
    try{
      pc=new RTCPeerConnection({iceServers:[]});
      wireChannel(pc.createDataChannel('batalha-local'));
      const offer=await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitIceComplete(pc);
      $('localOffer').value=encode({type:pc.localDescription.type,sdp:pc.localDescription.sdp});
      setStatus('📋 Código criado. Envie-o ao celular 2.');
    }catch(err){ setStatus('❌ Não foi possível criar a conexão: '+err.message); }
  }

  async function createJoin(){
    if(!requireWebRTC()) return;
    closeConnection(); role='join'; resetUI();
    $('localJoinArea').hidden=false;
    $('localRoleStep').textContent='Celular 2: cole o código recebido do celular 1.';
    setStatus('Aguardando o código do celular 1.');
    try{
      pc=new RTCPeerConnection({iceServers:[]});
      pc.ondatachannel=e=>wireChannel(e.channel);
    }catch(err){ setStatus('❌ Não foi possível preparar a conexão: '+err.message); }
  }

  async function makeAnswer(){
    if(!pc || role!=='join') return;
    try{
      await pc.setRemoteDescription(decode($('localOfferInput').value));
      const answer=await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitIceComplete(pc);
      $('localAnswer').value=encode({type:pc.localDescription.type,sdp:pc.localDescription.sdp});
      setStatus('📋 Resposta criada. Envie-a de volta ao celular 1.');
    }catch(err){ setStatus('❌ Não foi possível gerar a resposta: '+err.message); }
  }

  async function acceptAnswer(){
    if(!pc || role!=='host') return;
    try{
      await pc.setRemoteDescription(decode($('localAnswerInput').value));
      setStatus('⏳ Conectando ao celular 2...');
    }catch(err){ setStatus('❌ Resposta inválida: '+err.message); }
  }

  async function copyText(id){
    const el=$(id); if(!el || !el.value)return;
    try{await navigator.clipboard.writeText(el.value);setStatus('✅ Código copiado.');}
    catch(_){el.focus();el.select();setStatus('Selecione o código e use COPIAR.');}
  }

  function sendFleet(){
    if(!connected || started) return;
    if(!window.BNLocalCore.fleetComplete()){
      setStatus('⚠️ Posicione todos os cinco navios antes de enviar sua frota.');
      return;
    }
    const fleet=window.BNLocalCore.getFleet();
    myFleetSent=true;
    send({type:'fleet_ready',fleet});
    const btn=$('btnStart');
    if(btn){btn.disabled=true;btn.textContent='⏳ FROTA ENVIADA — AGUARDANDO ADVERSÁRIO';}
    setStatus(opponentFleet ? '🚢 As duas frotas estão prontas. Iniciando batalha...' : '🚢 Sua frota foi enviada. Aguardando a frota adversária...');
    maybeStart();
  }

  function prepareLocalBattleUI(){
    const btnStart=$('btnStart');
    const btnBack=$('btnBackSetup');
    if(btnStart){
      btnStart.disabled=false;
      btnStart.textContent='📡 ENVIAR FROTA E AGUARDAR ADVERSÁRIO';
      btnStart.onclick=sendFleet;
    }
    const btnRestart=$('btnRestart');
    if(btnRestart){
      btnRestart.onclick=()=>{
        closeConnection();
        if(window.BNLocalCore) window.BNLocalCore.cancel();
        if(btnStart) btnStart.textContent='INICIAR BATALHA';
      };
    }
    if(btnBack){
      btnBack.onclick=()=>{
        closeConnection();
        if(window.BNLocalCore) window.BNLocalCore.cancel();
        if(btnStart) btnStart.textContent='INICIAR BATALHA';
      };
    }
  }

  function install(){
    const btn=$('btnLocalNetwork');
    if(!btn) return;
    btn.onclick=()=>{
      closeConnection();
      setScreen('localNetwork');
      resetUI();
    };
    $('btnLocalHost')?.addEventListener('click',createHost);
    $('btnLocalJoin')?.addEventListener('click',createJoin);
    $('btnLocalMakeAnswer')?.addEventListener('click',makeAnswer);
    $('btnLocalAcceptAnswer')?.addEventListener('click',acceptAnswer);
    $('btnLocalCopyOffer')?.addEventListener('click',()=>copyText('localOffer'));
    $('btnLocalCopyAnswer')?.addEventListener('click',()=>copyText('localAnswer'));
    $('btnLocalNetworkBack')?.addEventListener('click',()=>{closeConnection();setScreen('home');});
  }

  window.BNLocalTransport={sendShot(index){
    if(!connected || !started || window.__bnLocalMyTurn!==true) return;
    send({type:'shot',index:Number(index)});
    setStatus('🎯 Tiro enviado. Aguardando resultado...');
    window.__bnLocalMyTurn=false;
  }};

  window.addEventListener('load',install);
})();

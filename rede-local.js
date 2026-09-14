/*
 * Batalha Naval MB — Rede Local (Etapa 1)
 *
 * Módulo totalmente separado do Firebase/Online.
 * Usa WebRTC DataChannel com ICE local (sem STUN/TURN), permitindo um teste
 * direto entre dois celulares na mesma rede Wi‑Fi. A sinalização é manual,
 * por copiar/colar, portanto não depende de servidor nem de internet.
 *
 * Esta etapa NÃO altera a lógica da batalha. Ela apenas prova a comunicação.
 */
(function(){
  'use strict';

  let pc = null;
  let channel = null;
  let role = null;
  let connected = false;
  const $ = id => document.getElementById(id);

  function setStatus(text){
    const el = $('localStatus');
    if(el) el.textContent = text;
  }

  function setScreen(id){
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    const el = $(id);
    if(el) el.classList.add('active');
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
  }

  function closeConnection(){
    connected=false;
    try{ if(channel) channel.close(); }catch(e){}
    try{ if(pc) pc.close(); }catch(e){}
    channel=null;
    pc=null;
    role=null;
  }

  function requireWebRTC(){
    if(!window.RTCPeerConnection){
      setStatus('❌ Este aplicativo/WebView não oferece suporte ao WebRTC. A etapa local não pode ser testada neste aparelho.');
      return false;
    }
    return true;
  }

  function waitIceComplete(peer){
    if(peer.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise(resolve=>{
      let done=false;
      const finish=()=>{ if(done) return; done=true; peer.removeEventListener('icegatheringstatechange',check); resolve(); };
      const check=()=>{ if(peer.iceGatheringState==='complete') finish(); };
      peer.addEventListener('icegatheringstatechange',check);
      setTimeout(finish,5000);
    });
  }

  function encode(obj){
    return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
  }

  function decode(text){
    try{
      return JSON.parse(decodeURIComponent(escape(atob(text.trim()))));
    }catch(e){
      throw new Error('Código inválido ou incompleto.');
    }
  }

  function wireChannel(ch){
    channel=ch;
    channel.onopen=()=>{
      connected=true;
      setStatus('✅ CONEXÃO ESTABELECIDA! Os dois celulares estão comunicando diretamente pelo Wi‑Fi.');
      if($('localMessageArea')) $('localMessageArea').hidden=false;
      if($('localRoleStep')) $('localRoleStep').textContent='Conexão pronta. Agora podemos testar a comunicação.';
    };
    channel.onclose=()=>{
      connected=false;
      setStatus('⚠️ A conexão foi encerrada.');
    };
    channel.onerror=()=>{
      setStatus('❌ Erro no canal de comunicação.');
    };
    channel.onmessage=e=>{
      let text='';
      try{
        const data=JSON.parse(e.data);
        text=data.text || e.data;
      }catch(_){ text=e.data; }
      if($('localReceived')) $('localReceived').textContent='📨 Recebido: '+text;
    };
  }

  async function createHost(){
    if(!requireWebRTC()) return;
    closeConnection();
    role='host';
    resetUI();
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
      setStatus('📋 Código criado. Envie-o ao celular 2. Depois cole aqui a resposta dele.');
    }catch(err){
      setStatus('❌ Não foi possível criar a conexão: '+err.message);
    }
  }

  async function createJoin(){
    if(!requireWebRTC()) return;
    closeConnection();
    role='join';
    resetUI();
    $('localJoinArea').hidden=false;
    $('localRoleStep').textContent='Celular 2: cole o código recebido do celular 1.';
    setStatus('Aguardando o código do celular 1.');

    try{
      pc=new RTCPeerConnection({iceServers:[]});
      pc.ondatachannel=e=>wireChannel(e.channel);
    }catch(err){
      setStatus('❌ Não foi possível preparar a conexão: '+err.message);
    }
  }

  async function makeAnswer(){
    if(!pc || role!=='join') return;
    try{
      const offer=decode($('localOfferInput').value);
      await pc.setRemoteDescription(offer);
      const answer=await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitIceComplete(pc);
      $('localAnswer').value=encode({type:pc.localDescription.type,sdp:pc.localDescription.sdp});
      setStatus('📋 Resposta criada. Envie-a de volta ao celular 1.');
    }catch(err){
      setStatus('❌ Não foi possível gerar a resposta: '+err.message);
    }
  }

  async function acceptAnswer(){
    if(!pc || role!=='host') return;
    try{
      const answer=decode($('localAnswerInput').value);
      await pc.setRemoteDescription(answer);
      setStatus('⏳ Conectando ao celular 2...');
    }catch(err){
      setStatus('❌ Resposta inválida: '+err.message);
    }
  }

  async function copyText(id){
    const el=$(id);
    if(!el || !el.value) return;
    try{
      await navigator.clipboard.writeText(el.value);
      setStatus('✅ Código copiado. Agora envie para o outro celular.');
    }catch(_){
      el.focus(); el.select();
      setStatus('Selecione o código e use COPIAR no celular.');
    }
  }

  function ping(){
    if(!channel || channel.readyState!=='open'){
      setStatus('⚠️ A conexão ainda não está estabelecida.');
      return;
    }
    channel.send(JSON.stringify({text:'Teste de comunicação do Batalha Naval MB 🚢'}));
    setStatus('📤 Teste enviado para o outro celular.');
  }

  function install(){
    const btn=$('btnLocalNetwork');
    const screen=$('localNetwork');
    if(!btn || !screen) return;

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
    $('btnLocalPing')?.addEventListener('click',ping);
    $('btnLocalNetworkBack')?.addEventListener('click',()=>{
      closeConnection();
      setScreen('home');
    });
  }

  window.addEventListener('load',install);
})();

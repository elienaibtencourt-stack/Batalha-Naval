/* Batalha Naval MB — QR Code para a troca dos dados WebRTC.
 * Esta camada é independente do Firebase/Online e mantém o método manual como fallback.
 */
(function(){
  'use strict';

  let stream = null;
  let scanTimer = null;
  let activeScanner = null;

  const $ = id => document.getElementById(id);

  function clearQR(id, imageId){
    const box=$(id), image=$(imageId);
    if(box) box.hidden=true;
    if(image) image.innerHTML='';
  }

  function renderQR(text, boxId, imageId){
    if(!text || !window.BNQRCode) return false;
    try{
      const qr=new window.BNQRCode(-1, 1); // L = menor redundância, maior capacidade
      qr.addData(text);
      qr.make();
      const count=qr.getModuleCount();
      const cell=Math.max(3, Math.floor(280/count));
      const margin=cell*4;
      const size=count*cell+margin*2;
      const canvas=document.createElement('canvas');
      canvas.width=size;
      canvas.height=size;
      const ctx=canvas.getContext('2d');
      ctx.fillStyle='#fff';
      ctx.fillRect(0,0,size,size);
      ctx.fillStyle='#000';
      for(let r=0;r<count;r++){
        for(let c=0;c<count;c++){
          if(qr.isDark(r,c)) ctx.fillRect(margin+c*cell,margin+r*cell,cell,cell);
        }
      }
      const image=$(imageId), box=$(boxId);
      if(image && box){
        image.innerHTML='';
        image.appendChild(canvas);
        box.hidden=false;
      }
      return true;
    }catch(err){
      console.error('QR generation error',err);
      return false;
    }
  }

  function stopScanner(){
    if(scanTimer){ clearInterval(scanTimer); scanTimer=null; }
    if(stream){ stream.getTracks().forEach(t=>{try{t.stop();}catch(_){}}); stream=null; }
    if(activeScanner){
      const v=$(activeScanner.videoId);
      if(v) v.srcObject=null;
      const area=$(activeScanner.areaId);
      if(area) area.hidden=true;
      activeScanner=null;
    }
  }

  async function startScanner(videoId, areaId, statusId, onResult){
    stopScanner();
    const status=$(statusId), area=$(areaId), video=$(videoId);
    if(!area || !video) return;
    area.hidden=false;

    if(!('BarcodeDetector' in window)){
      if(status) status.textContent='⚠️ O leitor QR não está disponível neste aparelho. Use o campo de código abaixo.';
      return;
    }
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
      if(status) status.textContent='⚠️ A câmera não está disponível neste aplicativo.';
      return;
    }

    try{
      let formats=['qr_code'];
      try{
        const supported=await BarcodeDetector.getSupportedFormats();
        if(!supported.includes('qr_code')) throw new Error('QR Code não suportado');
      }catch(_){ /* alguns WebViews não expõem getSupportedFormats; tentamos mesmo assim */ }

      const detector=new BarcodeDetector({formats});
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      video.srcObject=stream;
      await video.play();
      activeScanner={videoId,areaId,statusId};
      if(status) status.textContent='📷 Aponte a câmera para o QR Code...';

      scanTimer=setInterval(async()=>{
        if(!activeScanner || !video.videoWidth) return;
        try{
          const found=await detector.detect(video);
          if(found && found.length && found[0].rawValue){
            const value=found[0].rawValue.trim();
            if(value){
              if(status) status.textContent='✅ QR Code lido!';
              const cb=onResult;
              stopScanner();
              cb(value);
            }
          }
        }catch(err){
          // A leitura é tentada novamente no próximo ciclo.
        }
      },220);
    }catch(err){
      stopScanner();
      if(status){
        if(err && (err.name==='NotAllowedError' || err.name==='PermissionDeniedError')){
          status.textContent='⚠️ Permissão da câmera negada. Autorize a câmera e tente novamente.';
        }else{
          status.textContent='⚠️ Não foi possível abrir a câmera neste aparelho.';
        }
      }
    }
  }

  function waitForValue(id, callback){
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      const el=$(id);
      if(el && el.value){
        clearInterval(timer);
        callback(el.value);
      }else if(tries>80){
        clearInterval(timer);
      }
    },150);
  }

  function install(){
    // Celular 1: oferta -> QR
    $('btnLocalHost')?.addEventListener('click',()=>{
      clearQR('localOfferQR','localOfferQRImage');
      waitForValue('localOffer',value=>renderQR(value,'localOfferQR','localOfferQRImage'));
    });

    // Celular 2: resposta -> QR
    $('btnLocalMakeAnswer')?.addEventListener('click',()=>{
      clearQR('localAnswerQR','localAnswerQRImage');
      waitForValue('localAnswer',value=>renderQR(value,'localAnswerQR','localAnswerQRImage'));
    });

    // Celular 2 lê a oferta e gera a resposta automaticamente.
    $('btnQRScanOffer')?.addEventListener('click',()=>{
      startScanner('qrVideoOffer','qrScannerOffer','qrScanStatusOffer',value=>{
        const input=$('localOfferInput');
        if(input) input.value=value;
        $('btnLocalMakeAnswer')?.click();
      });
    });
    $('btnQRStopOffer')?.addEventListener('click',stopScanner);

    // Celular 1 lê a resposta e conecta automaticamente.
    $('btnQRScanAnswer')?.addEventListener('click',()=>{
      startScanner('qrVideoAnswer','qrScannerAnswer','qrScanStatusAnswer',value=>{
        const input=$('localAnswerInput');
        if(input) input.value=value;
        $('btnLocalAcceptAnswer')?.click();
      });
    });
    $('btnQRStopAnswer')?.addEventListener('click',stopScanner);

    $('btnLocalNetworkBack')?.addEventListener('click',()=>{
      stopScanner();
      clearQR('localOfferQR','localOfferQRImage');
      clearQR('localAnswerQR','localAnswerQRImage');
    });
  }

  window.BNLocalQR={renderQR, startScanner, stopScanner};
  window.addEventListener('load',install);
})();

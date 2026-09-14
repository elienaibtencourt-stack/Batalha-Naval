/* Batalha Naval MB — QR Code para a troca dos dados WebRTC.
 * Esta camada é independente do Firebase/Online e mantém o método manual como fallback.
 * Possui leitura ao vivo e também captura de foto, para WebViews que não liberam getUserMedia.
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
      const qr=new window.BNQRCode(-1, 1);
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

  function hideScannerArea(areaId){
    const area=$(areaId);
    if(area) area.hidden=true;
  }

  function stopScanner(){
    if(scanTimer){ clearInterval(scanTimer); scanTimer=null; }
    if(stream){ stream.getTracks().forEach(t=>{try{t.stop();}catch(_){}}); stream=null; }
    if(activeScanner){
      const v=$(activeScanner.videoId);
      if(v){ try{v.pause();}catch(_){} v.srcObject=null; }
      hideScannerArea(activeScanner.areaId);
      activeScanner=null;
    }
  }

  async function scanPhoto(inputId, statusId, onResult){
    const input=$(inputId), status=$(statusId);
    if(!input) return;
    if(status) status.textContent='📸 Fotografe o QR Code inteiro, de frente e bem próximo.';
    input.value='';
    input.onchange=async()=>{
      const file=input.files && input.files[0];
      if(!file) return;
      try{
        if(!window.BNQRDecoder) throw new Error('Leitor QR local não carregado');
        const img=await new Promise((resolve,reject)=>{
          const el=new Image();
          const url=URL.createObjectURL(file);
          el.onload=()=>{URL.revokeObjectURL(url);resolve(el);};
          el.onerror=e=>{URL.revokeObjectURL(url);reject(e);};
          el.src=url;
        });
        const max=1000, scale=Math.min(1,max/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
        const w=Math.max(1,Math.round((img.naturalWidth||img.width)*scale));
        const h=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));
        const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
        const ctx=canvas.getContext('2d',{willReadFrequently:true});
        ctx.drawImage(img,0,0,w,h);
        const result=window.BNQRDecoder.decodeImageData(ctx.getImageData(0,0,w,h).data,w,h);
        if(result){
          if(status) status.textContent='✅ QR Code lido!';
          onResult(result.trim());
        }else throw new Error('QR não reconhecido');
      }catch(err){
        console.error('QR photo scan error',err);
        if(status) status.textContent='⚠️ Não consegui ler. Deixe o QR inteiro na foto, sem cortar e de frente.';
      }finally{ input.value=''; }
    };
    input.click();
  }

  async function startScanner(videoId, areaId, statusId, onResult, photoInputId){
    stopScanner();
    const status=$(statusId), area=$(areaId), video=$(videoId);
    if(!area || !video) return;
    area.hidden=false;
    activeScanner={videoId,areaId,statusId};
    if(!window.BNQRDecoder){
      if(status) status.textContent='⚠️ Leitor QR local não carregado. Use a câmera de foto.';
      scanPhoto(photoInputId,statusId,onResult); return;
    }
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
      if(status) status.textContent='📸 Câmera ao vivo indisponível. Abrindo câmera de foto...';
      scanPhoto(photoInputId,statusId,onResult); return;
    }
    try{
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      video.setAttribute('autoplay',''); video.setAttribute('playsinline',''); video.muted=true; video.srcObject=stream;
      await video.play();
      if(status) status.textContent='📷 Aponte para o QR Code. O próprio aplicativo fará a leitura.';
      const canvas=document.createElement('canvas'); canvas.width=720; canvas.height=720;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      scanTimer=setInterval(()=>{
        if(!activeScanner || !video.videoWidth) return;
        try{
          const vw=video.videoWidth,vh=video.videoHeight,s=Math.min(vw,vh),sx=(vw-s)/2,sy=(vh-s)/2;
          canvas.width=720;canvas.height=720;ctx.drawImage(video,sx,sy,s,s,0,0,720,720);
          const result=window.BNQRDecoder.decodeImageData(ctx.getImageData(0,0,720,720).data,720,720,true);
          if(result){ const cb=onResult; if(status) status.textContent='✅ QR Code lido!'; stopScanner(); cb(result.trim()); }
        }catch(_){ }
      },350);
    }catch(err){
      console.warn('Camera live unavailable',err);
      stopScanner();
      if(status) status.textContent='📸 A câmera ao vivo não abriu. Use FOTOGRAFAR E LER QR.';
      scanPhoto(photoInputId,statusId,onResult);
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
    $('btnLocalHost')?.addEventListener('click',()=>{
      clearQR('localOfferQR','localOfferQRImage');
      waitForValue('localOffer',value=>renderQR(value,'localOfferQR','localOfferQRImage'));
    });

    $('btnLocalMakeAnswer')?.addEventListener('click',()=>{
      clearQR('localAnswerQR','localAnswerQRImage');
      waitForValue('localAnswer',value=>renderQR(value,'localAnswerQR','localAnswerQRImage'));
    });

    $('btnQRScanOffer')?.addEventListener('click',()=>{
      startScanner('qrVideoOffer','qrScannerOffer','qrScanStatusOffer',value=>{
        const input=$('localOfferInput');
        if(input) input.value=value;
        $('btnLocalMakeAnswer')?.click();
      },'qrPhotoOffer');
    });
    $('btnQRPhotoOffer')?.addEventListener('click',()=>scanPhoto('qrPhotoOffer','qrScanStatusOffer',value=>{
      const input=$('localOfferInput');
      if(input) input.value=value;
      $('btnLocalMakeAnswer')?.click();
    }));
    $('btnQRStopOffer')?.addEventListener('click',stopScanner);

    $('btnQRScanAnswer')?.addEventListener('click',()=>{
      startScanner('qrVideoAnswer','qrScannerAnswer','qrScanStatusAnswer',value=>{
        const input=$('localAnswerInput');
        if(input) input.value=value;
        $('btnLocalAcceptAnswer')?.click();
      },'qrPhotoAnswer');
    });
    $('btnQRPhotoAnswer')?.addEventListener('click',()=>scanPhoto('qrPhotoAnswer','qrScanStatusAnswer',value=>{
      const input=$('localAnswerInput');
      if(input) input.value=value;
      $('btnLocalAcceptAnswer')?.click();
    }));
    $('btnQRStopAnswer')?.addEventListener('click',stopScanner);

    $('btnLocalNetworkBack')?.addEventListener('click',()=>{
      stopScanner();
      clearQR('localOfferQR','localOfferQRImage');
      clearQR('localAnswerQR','localAnswerQRImage');
    });
  }

  window.BNLocalQR={renderQR,startScanner,stopScanner,scanPhoto};
  window.addEventListener('load',install);
})();

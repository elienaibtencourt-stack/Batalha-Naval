/* Batalha Naval MB - leitor QR offline, compatível com o gerador BNQRCode. */
(function(g){
  'use strict';
  function maskBit(mask,row,col){
    switch(mask){
      case 0:return (row+col)%2===0;
      case 1:return row%2===0;
      case 2:return col%3===0;
      case 3:return (row+col)%3===0;
      case 4:return (Math.floor(row/2)+Math.floor(col/3))%2===0;
      case 5:return ((row*col)%2)+((row*col)%3)===0;
      case 6:return (((row*col)%2)+((row*col)%3))%2===0;
      case 7:return (((row*col)%3)+((row+col)%2))%2===0;
      default:return false;
    }
  }
  function makeFunctionMask(version){
    if(!g.BNQRCode) throw new Error('Gerador QR não carregado');
    const q=new g.BNQRCode(version,1);
    const n=version*4+17;
    q.moduleCount=n;
    q.modules=Array.from({length:n},()=>Array(n).fill(null));
    q.setupPositionProbePattern(0,0);
    q.setupPositionProbePattern(n-7,0);
    q.setupPositionProbePattern(0,n-7);
    q.setupPositionAdjustPattern();
    q.setupTimingPattern();
    q.setupTypeInfo(true,0);
    if(version>=7) q.setupTypeNumber(true);
    return q.modules.map(r=>r.map(v=>v!==null));
  }
  function bitsToBytes(bits){
    const out=[]; let v=0;
    for(let i=0;i<bits.length;i++){
      v=(v<<1)|bits[i];
      if((i&7)===7){out.push(v);v=0;}
    }
    return out;
  }
  function extractCodewords(matrix,version,mask){
    const n=version*4+17, fn=makeFunctionMask(version), bits=[];
    let row=n-1, inc=-1;
    for(let col=n-1;col>0;col-=2){
      if(col===6) col--;
      while(true){
        for(let c=0;c<2;c++){
          const x=col-c;
          if(!fn[row][x]){
            let b=matrix[row][x]?1:0;
            if(maskBit(mask,row,x)) b^=1;
            bits.push(b);
          }
        }
        row+=inc;
        if(row<0||row>=n){row-=inc;inc=-inc;break;}
      }
    }
    return bitsToBytes(bits);
  }
  function dataBytesFromCodewords(codewords,version){
    const blocks=g.BNQRCode._getRSBlocks(version,1);
    if(!blocks||!blocks.length) throw new Error('Blocos RS indisponíveis');
    let offset=0, maxData=0;
    const dataBlocks=[];
    for(const b of blocks){
      dataBlocks.push(new Array(b.dataCount));
      maxData=Math.max(maxData,b.dataCount);
    }
    for(let i=0;i<maxData;i++){
      for(let b=0;b<blocks.length;b++){
        if(i<blocks[b].dataCount) dataBlocks[b][i]=codewords[offset++];
      }
    }
    // pula os bytes de correção de erro
    return dataBlocks.flat();
  }
  function readBits(bytes,countObj){
    let pos=0;
    const read=n=>{let v=0;for(let i=0;i<n;i++){if(pos>=bytes.length*8) throw new Error('Dados incompletos');v=(v<<1)|((bytes[pos>>3]>>(7-(pos&7)))&1);pos++;}return v;};
    return {read,get pos(){return pos;},set pos(v){pos=v;}};
  }
  function parsePayload(data,version){
    const br=readBits(data); let text='';
    while(br.pos+4<=data.length*8){
      const mode=br.read(4); if(mode===0) break;
      if(mode!==4) throw new Error('Modo QR não suportado: '+mode);
      const len=br.read(version<10?8:16); const bytes=new Uint8Array(len);
      for(let i=0;i<len;i++) bytes[i]=br.read(8);
      text+=new TextDecoder().decode(bytes);
    }
    if(!text) throw new Error('QR sem texto');
    return text;
  }
  function decodeMatrix(matrix){
    const n=matrix.length;
    if(!n||matrix.some(r=>r.length!==n)) throw new Error('Matriz inválida');
    const version=(n-17)/4;
    if(!Number.isInteger(version)||version<1||version>40) throw new Error('Versão QR inválida');
    for(let mask=0;mask<8;mask++){
      try{
        const cw=extractCodewords(matrix,version,mask);
        const data=dataBytesFromCodewords(cw,version);
        const text=parsePayload(data,version);
        if(/^BN[ZL]1\.[A-Za-z0-9+/=]+$/.test(text)) return text;
      }catch(_){ }
    }
    throw new Error('Não foi possível decodificar o QR');
  }
  function thresholdMatrix(imageData,width,height){
    const d=imageData, vals=new Uint8Array(width*height); let k=0;
    for(let y=0;y<height;y++) for(let x=0;x<width;x++,k++){
      const i=k*4; vals[k]=(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2])<150?1:0;
    }
    return {vals,width,height};
  }
  function tryCandidate(vals,w,h,x0,y0,size,version){
    const n=version*4+17, matrix=Array.from({length:n},()=>Array(n));
    const step=size/n;
    for(let r=0;r<n;r++) for(let c=0;c<n;c++){
      const x=Math.min(w-1,Math.max(0,Math.floor(x0+(c+.5)*step)));
      const y=Math.min(h-1,Math.max(0,Math.floor(y0+(r+.5)*step)));
      matrix[r][c]=!!vals[y*w+x];
    }
    return decodeMatrix(matrix);
  }
  function findFinders(vals,w,h){
    const scale=Math.max(1,Math.floor(Math.max(w,h)/700));
    const out=[];
    function runRow(y){
      let x=0;
      while(x<w){
        const colors=[]; const starts=[]; let cur=vals[y*w+x], s=x;
        while(x<w){
          const v=vals[y*w+x];
          if(v!==cur){colors.push(cur);starts.push(s);cur=v;s=x;}
          x++;
        }
        colors.push(cur);starts.push(s);
        for(let i=0;i+4<colors.length;i++){
          if(colors[i]!==1||colors[i+1]!==0||colors[i+2]!==1||colors[i+3]!==0||colors[i+4]!==1) continue;
          const lens=[];for(let j=0;j<5;j++){const e=(j+1<starts.length?starts[i+j+1]:w);lens.push(e-starts[i+j]);}
          const unit=(lens[0]+lens[1]+lens[3]+lens[4])/4;
          if(unit<1||lens[2]<unit*2||lens[2]>unit*4.5) continue;
          const total=lens.reduce((a,b)=>a+b,0);
          if(total<7*unit*.7||total>7*unit*1.4) continue;
          out.push({x:starts[i]+total/2,y:y,ms:total/7});
        }
      }
    }
    for(let y=0;y<h;y+=scale) runRow(y);
    // Cluster nearby detections.
    const clusters=[];
    for(const p of out){
      let c=clusters.find(c=>Math.hypot(c.x-p.x,c.y-p.y)<Math.max(10,p.ms*4));
      if(!c){c={x:p.x,y:p.y,ms:p.ms,n:1};clusters.push(c);}else{c.x=(c.x*c.n+p.x)/(c.n+1);c.y=(c.y*c.n+p.y)/(c.n+1);c.ms=(c.ms*c.n+p.ms)/(c.n+1);c.n++;}
    }
    return clusters.filter(c=>c.n>=1).sort((a,b)=>b.n-a.n).slice(0,40);
  }
  function matrixFromFinders(vals,w,h,finders){
    if(finders.length<3) throw new Error('Poucos padrões');
    // Choose a near-right triangle: TL is the point with smallest x+y; TR largest x-y; BL largest y-x.
    let tl=finders[0],tr=finders[0],bl=finders[0];
    for(const p of finders){if(p.x+p.y<tl.x+tl.y)tl=p;if(p.x-p.y>tr.x-tr.y)tr=p;if(p.y-p.x>bl.y-bl.x)bl=p;}
    const ms=(tl.ms+tr.ms+bl.ms)/3;
    const dx=Math.hypot(tr.x-tl.x,tr.y-tl.y), dy=Math.hypot(bl.x-tl.x,bl.y-tl.y);
    const n0=Math.round((Math.max(dx,dy)/ms)+7);
    const version=Math.round((n0-17)/4), n=version*4+17;
    if(version<1||version>40) throw new Error('Versão inválida');
    // Axis-aligned first; for camera photos we allow small skew by using the two edge vectors.
    const vx={x:(tr.x-tl.x)/(n-7),y:(tr.y-tl.y)/(n-7)};
    const vy={x:(bl.x-tl.x)/(n-7),y:(bl.y-tl.y)/(n-7)};
    const matrix=Array.from({length:n},()=>Array(n));
    for(let r=0;r<n;r++) for(let c=0;c<n;c++){
      const x=tl.x + (c-3.5)*vx.x + (r-3.5)*vy.x;
      const y=tl.y + (c-3.5)*vx.y + (r-3.5)*vy.y;
      const xi=Math.round(x), yi=Math.round(y);
      if(xi<0||yi<0||xi>=w||yi>=h) throw new Error('Fora da imagem');
      matrix[r][c]=!!vals[yi*w+xi];
    }
    return matrix;
  }
  function decodeImageData(imageData,width,height,noRotate){
    const t=thresholdMatrix(imageData,width,height), vals=t.vals;
    const finders=findFinders(vals,width,height);
    if(finders.length>=3){
      try{return decodeMatrix(matrixFromFinders(vals,width,height,finders));}catch(_){ }
    }
    // Fallback para códigos perfeitamente frontais: tenta recortes centrais e várias margens.
    const minSide=Math.min(width,height), crops=[];
    [1,.9,.8,.7].forEach(fr=>{const s=Math.floor(minSide*fr);crops.push([Math.floor((width-s)/2),Math.floor((height-s)/2),s]);});
    for(const [cx,cy,cs] of crops){
      let minX=cx+cs,maxX=cx,minY=cy+cs,maxY=cy,count=0;
      const stride=Math.max(1,Math.floor(cs/500));
      for(let y=cy;y<cy+cs;y+=stride) for(let x=cx;x<cx+cs;x+=stride) if(vals[y*width+x]){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);count++;}
      if(count<100) continue;
      const bw=maxX-minX+1,bh=maxY-minY+1;if(Math.abs(bw-bh)>Math.max(12,bw*.18))continue;
      for(let version=1;version<=40;version++){
        const n=version*4+17;
        for(let quiet=2;quiet<=6;quiet++){
          const modulePx=((bw+bh)/2)/(n-2*quiet),total=modulePx*n,x0=minX-quiet*modulePx,y0=minY-quiet*modulePx;
          if(total<cs*.3||total>cs*1.3)continue;
          try{return tryCandidate(vals,width,height,x0,y0,total,version);}catch(_){ }
        }
      }
    }
    if(!noRotate && typeof document!=='undefined' && document.createElement){
      try{
        const src=document.createElement('canvas'); src.width=width; src.height=height;
        const sc=src.getContext('2d'); sc.putImageData(new ImageData(imageData,width,height),0,0);
        const dst=document.createElement('canvas'); dst.width=width; dst.height=height;
        const dc=dst.getContext('2d',{willReadFrequently:true});
        for(const deg of [-10,-7,-5,-3,3,5,7,10]){
          dc.setTransform(1,0,0,1,0,0); dc.clearRect(0,0,width,height);
          dc.translate(width/2,height/2); dc.rotate(deg*Math.PI/180); dc.drawImage(src,-width/2,-height/2);
          dc.setTransform(1,0,0,1,0,0);
          try{return decodeImageData(dc.getImageData(0,0,width,height).data,width,height,true);}catch(_){ }
        }
      }catch(_){ }
    }
    throw new Error('QR não encontrado');
  }

  g.BNQRDecoder={decodeMatrix,decodeImageData};
})(window);

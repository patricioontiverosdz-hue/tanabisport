// Keep image data and color hints; discard camera metadata during publication.
// ICC JPEG segment format: https://www.color.org/profile_embedding/
const ICC_SIGNATURE=[73,67,67,95,80,82,79,70,73,76,69,0];
function jpegBytes(value,maxLength=500000) {
  if(typeof value!=='string'||value.length>maxLength||!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(value))throw Error('Usa una foto JPEG válida de hasta 500000 caracteres.');
  const encoded=value.split(',')[1];if(encoded.length%4)throw Error('JPEG incompleto.');
  let raw;try{raw=atob(encoded);}catch{throw Error('JPEG inválido.');}
  const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
  if(bytes.length<100||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)throw Error('JPEG incompleto.');
  return bytes;
}
function iccChunk(bytes,start,size) {
  if(size<15||!ICC_SIGNATURE.every((v,i)=>bytes[start+i]===v))return null;
  return {sequence:bytes[start+12],total:bytes[start+13]};
}
function coherentIcc(chunks) {
  if(!chunks.length)return true;
  const total=chunks[0].total,seen=new Set();
  return total>0&&chunks.length===total&&chunks.every(c=>c.total===total&&c.sequence>0&&c.sequence<=total&&!seen.has(c.sequence)&&!!seen.add(c.sequence));
}
function adobeHint(bytes,start,size) {
  return size===12&&[65,100,111,98,101].every((v,i)=>bytes[start+i]===v);
}
export function normalizePortfolioJpeg(value,{maxLength=500000}={}) {
  const bytes=jpegBytes(value,maxLength),parts=[{bytes:bytes.subarray(0,2)}],icc=[];
  let at=2;
  while(at<bytes.length-2){
    if(bytes[at]!==255||bytes[at+1]===255)throw Error('Estructura JPEG inválida.');
    const marker=bytes[at+1],length=(bytes[at+2]<<8)|bytes[at+3],end=at+2+length;
    if(length<2||end>bytes.length-2)throw Error('Segmento JPEG inválido.');
    if(marker===0xda){parts.push({bytes:bytes.subarray(at)});break;}
    const segment=bytes.subarray(at,end),profile=marker===0xe2?iccChunk(bytes,at+4,length-2):null;
    if(profile){icc.push(profile);parts.push({bytes:segment,icc:true});}
    else if(marker===0xe0){
      if(length>=16&&String.fromCharCode(...bytes.subarray(at+4,at+9))==='JFIF\0'){
        const jfif=segment.slice(0,18);jfif[2]=0;jfif[3]=16;jfif[16]=0;jfif[17]=0;parts.push({bytes:jfif});
      }
    }else if(marker===0xee&&adobeHint(bytes,at+4,length-2))parts.push({bytes:segment});
    else if(!(marker>=0xe1&&marker<=0xef||marker===0xfe))parts.push({bytes:segment});
    at=end;
  }
  const keepIcc=coherentIcc(icc),kept=parts.filter(p=>!p.icc||keepIcc),length=kept.reduce((n,p)=>n+p.bytes.length,0),clean=new Uint8Array(length);
  let offset=0;for(const part of kept){clean.set(part.bytes,offset);offset+=part.bytes.length;}
  const binary=[];for(let i=0;i<clean.length;i+=8192)binary.push(String.fromCharCode(...clean.subarray(i,i+8192)));
  const normalized='data:image/jpeg;base64,'+btoa(binary.join(''));
  validatePortfolioJpeg(normalized,{maxLength});
  return normalized;
}
// Validate the normalized baseline image, including all tables and scan bounds.
export function validatePortfolioJpeg(value,{maxLength=500000}={}) {
  const bytes=jpegBytes(value,maxLength);
  let at=2,frame=false,scan=false,width=0,height=0;
  const icc=[];
  const quantization=new Set(),dc=new Set(),ac=new Set(),components=new Map();
  while(at<bytes.length-2){
    if(bytes[at++]!==255)throw Error('Estructura JPEG inválida.');
    const marker=bytes[at++];if(marker===255)throw Error('Estructura JPEG inválida.');
    const length=(bytes[at]<<8)|bytes[at+1];if(length<2||at+length>bytes.length-2)throw Error('Segmento JPEG inválido.');
    const profile=marker===0xe2?iccChunk(bytes,at+2,length-2):null;
    if(profile)icc.push(profile);
    else if((marker>=0xe1&&marker<=0xef||marker===0xfe)&&!(marker===0xee&&adobeHint(bytes,at+2,length-2)))throw Error('La imagen no pudo prepararse correctamente.');
    if(marker===0xe0&&(length!==16||String.fromCharCode(...bytes.slice(at+2,at+7))!=='JFIF\0'||bytes[at+14]!==0||bytes[at+15]!==0))throw Error('JPEG no compatible.');
    if(marker===0xdb){
      let cursor=at+2;while(cursor<at+length){const descriptor=bytes[cursor++];if(descriptor>3||cursor+64>at+length)throw Error('Tabla JPEG inválida.');quantization.add(descriptor);cursor+=64;}
      if(cursor!==at+length)throw Error('Tabla JPEG inválida.');
    }
    if(marker===0xc4){
      let cursor=at+2;while(cursor<at+length){const descriptor=bytes[cursor++],kind=descriptor>>4,id=descriptor&15;if(kind>1||id>3||cursor+16>at+length)throw Error('Tabla JPEG inválida.');let symbols=0;for(let n=0;n<16;n++)symbols+=bytes[cursor++];if(!symbols||symbols>256||cursor+symbols>at+length)throw Error('Tabla JPEG inválida.');cursor+=symbols;(kind===0?dc:ac).add(id);}
      if(cursor!==at+length)throw Error('Tabla JPEG inválida.');
    }
    if(marker===0xc0){
      if(frame||length<11||bytes[at+2]!==8)throw Error('JPEG no compatible.');
      height=(bytes[at+3]<<8)|bytes[at+4];width=(bytes[at+5]<<8)|bytes[at+6];const count=bytes[at+7];
      if(!width||!height||width>1600||height>1600||width*height>2560000||![1,3].includes(count)||length!==8+3*count)throw Error('La foto supera las dimensiones permitidas.');
      for(let n=0;n<count;n++){const cursor=at+8+3*n,id=bytes[cursor],sampling=bytes[cursor+1],table=bytes[cursor+2];if(components.has(id)||table>3||(sampling>>4)<1||(sampling>>4)>4||(sampling&15)<1||(sampling&15)>4)throw Error('Componentes JPEG inválidos.');components.set(id,table);}
      frame=true;
    }else if([0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker))throw Error('Usa JPEG estándar generado por el formulario.');
    if(marker===0xda){
      const count=bytes[at+2];
      if(!frame||scan||!coherentIcc(icc)||count!==components.size||length!==6+2*count||bytes[at+3+2*count]!==0||bytes[at+4+2*count]!==63||bytes[at+5+2*count]!==0)throw Error('JPEG no compatible.');
      const used=new Set();for(let n=0;n<count;n++){const id=bytes[at+3+2*n],tables=bytes[at+4+2*n];if(used.has(id)||!components.has(id)||!quantization.has(components.get(id))||!dc.has(tables>>4)||!ac.has(tables&15))throw Error('Faltan tablas de la imagen JPEG.');used.add(id);}
      scan=true;at+=length;if(at>=bytes.length-2)throw Error('JPEG sin datos de imagen.');
      for(;at<bytes.length-2;at++)if(bytes[at]===255){const following=bytes[++at];if(following!==0&&!(following>=0xd0&&following<=0xd7))throw Error('Datos JPEG inválidos.');}
      break;
    }
    at+=length;
  }
  if(!frame||!scan||at!==bytes.length-2)throw Error('Falta una imagen JPEG completa.');
  return {width,height,bytes:bytes.length};
}

/** Portfolio and homepage publishing is manual; old metadata is accepted for open clients. */
export function validatePortfolioInput(payload,{update=false}={}) {
 const fields=['request_id','title','image','season_end','consent_until','consent_reference','contains_minors','guardian_reference','consent_confirmed','guardian_confirmed'];
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).some(key=>!fields.includes(key))
  ||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(payload.request_id||'')
  ||typeof payload.title!=='string'||!payload.title.trim()||payload.title.trim().length>80)throw Error('Revisa el título y la solicitud de la fotografía.');
 if(!update||Object.hasOwn(payload,'image'))payload.image=normalizePortfolioJpeg(payload.image);
 return {full:!update||Object.hasOwn(payload,'image')};
}

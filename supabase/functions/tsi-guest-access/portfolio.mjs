// Bounded baseline-JPEG parser. It rejects external URLs, EXIF/IPTC/comments,
// oversized dimensions, malformed segments and unexpected entropy markers.
export function validatePortfolioJpeg(value) {
  if(typeof value!=='string'||value.length>500000||!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(value))throw Error('Usa una foto JPEG válida de hasta 500000 caracteres.');
  const encoded=value.split(',')[1];if(encoded.length%4)throw Error('JPEG incompleto.');
  let raw;try{raw=atob(encoded);}catch{throw Error('JPEG inválido.');}
  const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
  if(bytes.length<100||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)throw Error('JPEG incompleto.');
  let at=2,frame=false,scan=false,width=0,height=0,jfif=false;
  const quantization=new Set(),dc=new Set(),ac=new Set(),components=new Map();
  while(at<bytes.length-2){
    if(bytes[at++]!==255)throw Error('Estructura JPEG inválida.');
    const marker=bytes[at++];if(marker===255)throw Error('Estructura JPEG inválida.');
    if(marker>=0xe1&&marker<=0xef||marker===0xfe)throw Error('La foto contiene metadatos. Prepárala nuevamente desde el formulario.');
    const length=(bytes[at]<<8)|bytes[at+1];if(length<2||at+length>bytes.length-2)throw Error('Segmento JPEG inválido.');
    if(marker===0xe0){if(length!==16||String.fromCharCode(...bytes.slice(at+2,at+7))!=='JFIF\0'||bytes[at+14]!==0||bytes[at+15]!==0)throw Error('JPEG con metadatos o miniaturas no permitido.');jfif=true;}
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
      if(!jfif||!frame||scan||count!==components.size||length!==6+2*count||bytes[at+3+2*count]!==0||bytes[at+4+2*count]!==63||bytes[at+5+2*count]!==0)throw Error('JPEG no compatible.');
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

/** Validates the complete authorization whenever image or consent metadata changes. */
export function validatePortfolioInput(payload,{update=false,now=Date.now()}={}) {
 const fields=['request_id','title','image','season_end','consent_until','consent_reference','contains_minors','guardian_reference','consent_confirmed','guardian_confirmed'];
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).some(key=>!fields.includes(key))
  ||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(payload.request_id||'')
  ||typeof payload.title!=='string'||!payload.title.trim()||payload.title.trim().length>80)throw Error('Revisa el título y la solicitud de la fotografía.');
 const full=!update||Object.keys(payload).some(key=>!['request_id','title'].includes(key));
 if(!full)return {full:false};
 if(typeof payload.contains_minors!=='boolean'||payload.consent_confirmed!==true||!/^[A-Za-z0-9][A-Za-z0-9._/-]{2,159}$/.test(payload.consent_reference||'')
  ||payload.contains_minors&&(payload.guardian_confirmed!==true||!/^[A-Za-z0-9][A-Za-z0-9._/-]{2,159}$/.test(payload.guardian_reference||'')))
  throw Error('Confirma la autorización documentada para publicación pública y la del tutor si hay menores.');
 for(const date of [payload.season_end,payload.consent_until])if(typeof date!=='string'||!Number.isFinite(Date.parse(date))||Date.parse(date)<=now)throw Error('Confirma fechas futuras de temporada y autorización.');
 if(!update||Object.hasOwn(payload,'image'))validatePortfolioJpeg(payload.image);
 return {full:true};
}

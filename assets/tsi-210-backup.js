(function(root,factory){'use strict';var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TSI210Backup=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';var enc=new TextEncoder(),dec=new TextDecoder(),FORMAT='tsi-encrypted-backup';
 function base64(bytes){var out='';for(var i=0;i<bytes.length;i+=24576)out+=String.fromCharCode.apply(null,bytes.subarray(i,i+24576));return btoa(out);}
 function bytes(text){if(typeof text!=='string'||text.length>150000000||!/^[A-Za-z0-9+/=]*$/.test(text))throw new Error('Contenido del respaldo inválido.');return Uint8Array.from(atob(text),function(c){return c.charCodeAt(0);});}
 async function sha(data){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data))).map(function(n){return n.toString(16).padStart(2,'0');}).join('');}
 async function key(password,salt,iterations){var raw=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
 async function seal(payload,password,project){
  if(typeof password!=='string'||password.length<12)throw new Error('Usa una contraseña de al menos 12 caracteres.');
  var salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),iterations=310000;
  var raw=enc.encode(JSON.stringify(payload));if(raw.length>100000000)throw new Error('El respaldo supera el límite de 100 MB.');
  var encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(password,salt,iterations),raw);
  return {format:FORMAT,version:1,project,algorithm:'AES-256-GCM',kdf:'PBKDF2-SHA256',iterations,salt:base64(salt),iv:base64(iv),payload:base64(new Uint8Array(encrypted))};
 }
 async function open(envelope,password,project){
  if(!envelope||envelope.format!==FORMAT||envelope.version!==1||envelope.algorithm!=='AES-256-GCM'||envelope.kdf!=='PBKDF2-SHA256'||envelope.iterations<310000||envelope.iterations>1000000)throw new Error('Formato de respaldo no compatible.');
  if(envelope.project!==project)throw new Error('El respaldo pertenece a otro entorno. No mezcles pruebas con producción.');
  try{var iv=bytes(envelope.iv),salt=bytes(envelope.salt);if(iv.length!==12||salt.length!==16)throw Error();var clear=await crypto.subtle.decrypt({name:'AES-GCM',iv},await key(password,salt,envelope.iterations),bytes(envelope.payload));return JSON.parse(dec.decode(clear));}catch(e){throw new Error('Contraseña incorrecta o respaldo alterado.');}
 }
 async function verify(payload){
  if(!payload||payload.snapshot?.format!=='tsi-operational-backup'||payload.snapshot.schema_version!==1||!payload.snapshot.tables||!Array.isArray(payload.assets))throw new Error('El respaldo está incompleto.');
  if(await sha(enc.encode(JSON.stringify(payload.snapshot)))!==payload.snapshot_sha256)throw new Error('Los datos del respaldo no coinciden con su manifiesto.');
  var files=payload.snapshot.files||[];if(files.length!==payload.assets.length)throw new Error('Faltan archivos adjuntos en el respaldo.');
  var seen=new Set();for(var i=0;i<files.length;i++){
   var f=files[i],asset=payload.assets.find(function(a){return a.bucket===f.bucket&&a.name===f.name;}),id=f.bucket+'/'+f.name;
   if(!asset||seen.has(id))throw new Error('Falta un adjunto o está duplicado.');seen.add(id);
   var raw=bytes(asset.base64);if(await sha(raw)!==asset.sha256||asset.size!==raw.length)throw new Error('Un archivo adjunto no pasó la comprobación de integridad.');
  }
  return {tables:Object.keys(payload.snapshot.tables).length,records:Object.values(payload.snapshot.tables).reduce(function(n,rows){if(!Array.isArray(rows))throw new Error('Tabla inválida.');return n+rows.length;},0),files:files.length,verified:true};
 }
 return {base64,bytes,sha,seal,open,verify};
});

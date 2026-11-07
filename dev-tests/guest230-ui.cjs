const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(test){for(let n=0;n<100;n++){if(test())return;await pause(5);}throw Error('UI timeout');}
async function main(){
 const modulePath=require.resolve('happy-dom',{paths:[root,path.resolve(root,'../tanabisport')]}),{Window}=await import(require('node:url').pathToFileURL(modulePath).href);
 const window=new Window({url:'https://patricioontiverosdz-hue.github.io/tanabisport/staging/'});window.document.body.innerHTML='<button id="entry">Entrar</button>';
 let role='',revoked=false,deferVerify,holdVerify=false;const token='a'.repeat(64),state={shop:{items:[]}},calls=[];
 window.eval(fs.readFileSync(path.join(root,'staging/tsi-230-guest.js'),'utf8'));
 const guest=window.TSI230Guest.install({state,me:()=>role?{id:'admin-one',role}:null,render(){},async edge(body,credential){calls.push({body,credential});
  if(body.action==='verify'){if(holdVerify)await new Promise(resolve=>deferVerify=resolve);return {token,expires_at:new Date(Date.now()+3600000).toISOString()};}
  if(body.action==='status'){if(revoked)throw Object.assign(Error('Revocado'),{status:403});assert.equal(credential,token);return {allowed:true};}
  if(body.action==='list'){assert.equal(credential,token);return {items:[{id:'one',title:'Scoped'}]};}
  if(body.action==='preview'){assert.equal(credential,token);return {image:'data:image/jpeg;base64,/9j/AAAA'};}
  if(body.action==='logout'){assert.equal(credential,token);return {closed:true};}
  if(body.action==='admin'){assert.equal(role,'admin');return {folders:[],contacts:[],invitations:[],sessions:[],available_folders:['Synthetic'],email_ready:false,test_mode:true};}
  throw Error('Unexpected '+body.action);
 }});
 const fill=(id,value)=>{window.document.getElementById(id).value=value;},submit=selector=>window.document.querySelector(selector).dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
 try{
  assert.equal(guest.authorized(),false);assert.equal(guest.token(),'');assert.equal(guest.adminPanel(),'');
  let settled;guest.open().then(result=>settled=result);assert.ok(window.document.body.textContent.includes('No necesitas crear una cuenta'));
  fill('g230-challenge','10000000-0000-4000-8000-000000000001');fill('g230-code','123456');submit('[data-g230-form="verify"]');await until(()=>settled===true);
  assert.equal(guest.authorized(),true);assert.equal(guest.token(),token);assert.equal(window.localStorage.length,0);assert.equal(window.sessionStorage.length,0);
  assert.equal(await guest.ensureAccess(),true);await guest.loadShop();assert.equal(state.shop.items.length,1);assert.equal(state.shop.items[0].img,'data:image/jpeg;base64,/9j/AAAA');
  revoked=true;await assert.rejects(guest.status(),/Revocado/);assert.equal(guest.authorized(),false);assert.equal(state.shop.items.length,0,'Revocar elimina imágenes de memoria');revoked=false;
  role='admin';assert.ok(guest.adminPanel().includes('data-tsi230-guest="admin"'));await guest.openAdmin();assert.ok(window.document.body.textContent.includes('Solo se pueden crear invitaciones marcadas PRUEBA'));assert.ok(window.document.querySelector('[name="season_end"]').required);assert.ok(window.document.querySelector('[name="approved"]').required);
  window.document.querySelector('[data-g230="close"]').click();
  role='';holdVerify=true;let canceled;guest.open().then(result=>canceled=result);fill('g230-challenge','10000000-0000-4000-8000-000000000001');fill('g230-code','123456');submit('[data-g230-form="verify"]');await until(()=>!!deferVerify);window.document.querySelector('[data-g230="close"]').click();deferVerify();await pause(20);assert.equal(canceled,false);assert.equal(guest.authorized(),false,'Respuesta tardía no activa sesión después de cerrar');assert.equal(window.document.querySelector('[data-g230-modal]'),null);
  assert.ok(calls.every(call=>!JSON.stringify(call.body).includes('/auth/v1/')),'Invitados nunca llaman Auth');
  console.log('PASS guest230 UI: OTP entry, explicit test flow, scoped images, no persisted tokens, revoke clearing, admin approvals, stale response cancellation.');
 }finally{await window.happyDOM.cancelAsync();window.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

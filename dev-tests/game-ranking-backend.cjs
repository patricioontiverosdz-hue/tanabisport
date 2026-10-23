const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),folder=path.join(root,'supabase/functions/training-game');
const camera=require('../staging/photo-game-model.js'),editing=require('../staging/editing-game-model.js');
const uid='00000000-0000-4000-8000-000000000001';
const goodCamera={shutter:1000,aperture:4,iso:100};
const goodEditing={...editing.DEFAULTS,exposure:1,temperature:-10,shadows:35};
async function main(){
 for(const file of ['photo-game-model.js','editing-game-model.js'])assert.equal(fs.readFileSync(path.join(folder,file),'utf8'),fs.readFileSync(path.join(root,'staging',file),'utf8'),'Modelo idéntico en servidor: '+file);
 const {createHandler,STAGING_URL}=await import('../supabase/functions/training-game/handler.mjs');
 let authStatus=200,role='foto',anonymous=false,savedFailure=false,badBest=false,networkFailure=false;
 const calls=[],best=new Map();
 const send=async(url,init)=>{
  calls.push({url,init});if(networkFailure)throw Error('No network');
  if(url.endsWith('/auth/v1/user')){assert.equal(init.headers.apikey,'anon-test');assert.equal(init.headers.Authorization,'Bearer user-test');return Response.json({id:uid,is_anonymous:anonymous},{status:authStatus});}
  assert.equal(init.headers.apikey,'service-test');assert.equal(init.headers.Authorization,'Bearer service-test');
  if(url.includes('/rest/v1/profiles?'))return Response.json([{role}]);
  assert.ok(url.endsWith('/rest/v1/rpc/tsi_game_save_result'));
  if(savedFailure)return Response.json({error:'no'},{status:500});
  const payload=JSON.parse(init.body);assert.equal(payload.p_user_id,uid,'La identidad viene del usuario verificado');
  const key=payload.p_user_id+'|'+payload.p_game+'|'+payload.p_scene_id;
  best.set(key,Math.max(best.get(key)||0,payload.p_score));return Response.json({best_score:badBest?-1:best.get(key)});
 };
 const options={url:STAGING_URL,anonKey:'anon-test',serviceKey:'service-test',models:{camera,editing},fetch:send};
 const handler=createHandler(options);
 const payload=(game='camera',sceneId='daylight-action',settings=goodCamera)=>({game,sceneId,settings});
 async function request(body=payload(),opts={}){
  const headers={authorization:'Bearer user-test','content-type':'application/json',origin:'https://patricioontiverosdz-hue.github.io',...opts.headers};
  const req=new Request(STAGING_URL+'/functions/v1/training-game',{method:opts.method||'POST',headers,body:opts.method==='GET'||opts.method==='OPTIONS'?undefined:typeof body==='string'?body:JSON.stringify(body)});
  const response=await (opts.handler||handler)(req);let json=null;try{json=await response.json();}catch{}
  return {response,json};
 }
 let r=await request();assert.equal(r.response.status,200);assert.equal(r.json.accepted,true);assert.equal(r.json.score,100);assert.equal(r.json.best_score,100);
 assert.equal(r.response.headers.get('access-control-allow-origin'),'https://patricioontiverosdz-hue.github.io');
 let last=JSON.parse(calls.at(-1).init.body);assert.equal(last.p_score,camera.evaluate(camera.SCENES[0],goodCamera).score);
 r=await request(payload('camera','daylight-action',{shutter:30,aperture:16,iso:12800}));assert.equal(r.json.best_score,100,'Un intento peor no empeora la marca');
 r=await request(payload('editing','night-detail',goodEditing));assert.equal(r.json.score,100);assert.equal(r.json.best_score,100);
 for(const [game,model,settings] of [['camera',camera,goodCamera],['editing',editing,editing.DEFAULTS]])for(const scene of model.SCENES){
  r=await request(payload(game,scene.id,settings));assert.equal(r.response.status,200,'Servidor acepta reto '+scene.id);assert.equal(r.json.score,model.evaluate(scene,settings).score,'Puntuación canónica '+scene.id);
 }
 const invalid=[{...payload(),score:100},{...payload(),uid:'otra-cuenta'},payload('camera','unknown'),payload(['camera']),payload('all'),payload('camera','daylight-action',{...goodCamera,iso:'100'}),payload('camera','daylight-action',{...goodCamera,extra:1}),payload('editing','night-detail',{...goodEditing,exposure:99}),payload('editing','night-detail',{...goodEditing,crop:'wrong'}),null,[],{},'not json',' '.repeat(4097)];
 for(const body of invalid){const before=calls.filter(x=>x.url.endsWith('tsi_game_save_result')).length;r=await request(body);assert.equal(r.response.status,400);assert.equal(calls.filter(x=>x.url.endsWith('tsi_game_save_result')).length,before,'Entrada inválida no se guarda');}
 role='cliente';r=await request();assert.equal(r.response.status,403);role='editora';r=await request();assert.equal(r.response.status,200);role='admin';r=await request();assert.equal(r.response.status,200);
 anonymous=true;r=await request();assert.equal(r.response.status,401);anonymous=false;
 authStatus=401;r=await request();assert.equal(r.response.status,401);authStatus=200;
 const before=calls.length;r=await request(payload(),{headers:{authorization:''}});assert.equal(r.response.status,401);assert.equal(calls.length,before);
 r=await request(payload(),{headers:{origin:'https://otro.invalid'}});assert.equal(r.response.status,403);
 r=await request(payload(),{headers:{'content-type':'text/plain'}});assert.equal(r.response.status,415);
 r=await request(payload(),{method:'GET'});assert.equal(r.response.status,405);
 r=await request(payload(),{method:'OPTIONS',headers:{authorization:''}});assert.equal(r.response.status,204);
 r=await request(payload(),{handler:createHandler({...options,url:'https://produccion.invalid'})});assert.equal(r.response.status,503);
 savedFailure=true;r=await request();assert.equal(r.response.status,502);savedFailure=false;
 badBest=true;r=await request();assert.equal(r.response.status,502);badBest=false;
 networkFailure=true;r=await request();assert.equal(r.response.status,502);
 console.log('Ranking backend: 36 retos canónicos, identidad verificada, roles, mejores marcas, payload/tamaño, CORS, errores y aislamiento staging aprobados.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});

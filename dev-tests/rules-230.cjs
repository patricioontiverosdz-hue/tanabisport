const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.join(__dirname,'..');
const script=fs.readFileSync(path.join(root,'staging/tsi-230-rules.js'),'utf8');
const html=fs.readFileSync(path.join(root,'staging/equipo.html'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261107024910_tsi230_access_payroll_rules.sql'),'utf8');
const week='2026-11-02';
const editor={id:'editor-a',name:'Editora A',role:'editora'},otherEditor={id:'editor-b',name:'Editora B',role:'editora'},photo={id:'photo-a',name:'Fotógrafo',role:'foto'};
let Window;
function monday(value){const date=new Date(value+'T12:00:00Z');if(!Number.isFinite(date.getTime()))return '';date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);return date.toISOString().slice(0,10);}
function empty(){return {availability:[],clock:[],suspensions:[]};}
function schedule(options={}){return {photographer_id:photo.id,week_start:week,version:1,schedule:Array.from({length:7},()=>({available:true,start:'16:00',end:'21:00'})),...options};}
function match(id,players=10,extra={}){return {id,teams:'Cobertura '+id,date:'2026-11-07',time:'18:00',ed:editor.id,edBy:'',f1:photo.id,f2:'',stage:'listos',cov:{players,price:200,paid:0},...extra};}
function extractCalc(){const found=html.match(/function calcPay\([^]*?\r?\n\}/);assert.ok(found,'The real payroll implementation is used for rate tests');return found[0];}
async function environment(role='foto'){
 const window=new Window({url:'https://example.invalid/staging/',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}}),document=window.document;
 document.body.innerHTML='<div id="app"></div>';
 let current=role==='foto'?photo:role==='editora'?editor:{id:'admin',role:'admin'},reply=empty(),failure=null,waiter=null,timer={sessions:[]},renderCount=0;
 const S={matches:[],users:[editor,otherEditor,photo],pays:{'editor-a|2026-10-26':{status:'aprobado',lines:[{mid:'old',amount:120}],total:120}},view:'dash',tab:'partidos',banner:'',rates:{ed:[[1,19,7],[20,9999,5]],foto:[[1,9999,10]]}};
 const calls=[];
 window.eval(script);
 const rules=window.TSI230Rules.install({state:S,me:()=>current,payKind:(u,rows)=>window.__realPayKind(u,rows),editingState:()=>timer,sb:async(method,url,body)=>{calls.push({method,url,body});if(waiter)return await waiter;if(failure)throw failure;return structuredClone(reply);},render:()=>{renderCount++;}});
 window.__rulesS=S;
 window.eval('var S=window.__rulesS;var mondayOf='+monday.toString()+';function byRole(r){return S.users.filter(function(u){return u.role===r;});}function payKind(u,rows){return u.role==="editora"?"ed":u.role==="foto"?"foto":rows.some(function(m){return m.f1===u.id||m.f2===u.id;})?"foto":"ed";}function rateFor(kind,n){var row=S.rates[kind].find(function(r){return r[0]<=n&&r[1]>=n;});return row?row[2]:0;}function tramoLabel(kind,n){var row=S.rates[kind].find(function(r){return r[0]<=n&&r[1]>=n;});return row?row[0]+" a "+row[1]:"";}function playersFor(m,id){return m.f1===id||m.f2===id?Number(m.cov.players)||0:0;}function money(n){return "$"+n;}function cmp(a,b){return (a.date+a.time).localeCompare(b.date+b.time);}var STAGES=[["listos","Fotos listas"]];function stageIdx(stage){return stage==="listos"?0:-1;}function addExtras(u,w,out){out.bonus=[];out.reimb=[];out.ded=[];out.net=out.total;}'+extractCalc()+';window.__realCalcPay=calcPay;window.__realPayKind=payKind;');
 return {window,document,S,rules,calls,base:(u,w)=>window.__realCalcPay(u,w),setUser:u=>{current=u;},setReply:value=>{reply=value;failure=null;},setError:error=>{failure=error;},setWaiter:value=>{waiter=value;},setTimer:value=>{timer=value;},renders:()=>renderCount,close:async()=>{await window.happyDOM.cancelAsync();window.close();}};
}
async function selection(){const e=await environment();try{
 const target=match('target');e.S.matches=[target];assert.equal(e.rules.canTake(target,photo),false,'Missing server verification blocks selection');
 let data={...empty(),availability:[schedule()]};e.setReply(data);await e.rules.reload();assert.equal(e.rules.status().ready,true);assert.equal(e.rules.canTake(target,photo),true);
 assert.equal(e.rules.canTake({...target,date:'2026-11-14'},photo),false,'Availability never carries into another week');
 assert.equal(e.rules.canTake({...target,time:'15:59'},photo),false);assert.equal(e.rules.canTake({...target,time:'16:00'},photo),true);assert.equal(e.rules.canTake({...target,time:'20:59'},photo),true);assert.equal(e.rules.canTake({...target,time:'21:00'},photo),false,'End boundary is excluded');
 assert.equal(e.rules.canTake({...target,time:'18:00:00'},photo),true);for(const time of ['24:00','18:77','6:00',''])assert.equal(e.rules.canTake({...target,time},photo),false,'Invalid time '+time);
 assert.equal(e.rules.canTake(target,editor),false);
 data.availability.push(schedule({version:2,schedule:Array.from({length:7},()=>({available:false,start:'16:00',end:'21:00'}))}));e.setReply(data);await e.rules.reload();assert.equal(e.rules.canTake(target,photo),false,'Latest confirmed version controls eligibility');
 data.availability=[schedule()];data.suspensions=[{user_id:photo.id,start_date:'2026-11-07',end_date:'2026-11-07'}];e.setReply(data);await e.rules.reload();assert.equal(e.rules.canTake(target,photo),false,'Suspension overrides confirmed hours');
 data.suspensions=[{user_id:'other-photo',start_date:'2026-11-07',end_date:'2026-11-07'}];e.setReply(data);await e.rules.reload();assert.equal(e.rules.canTake(target,photo),true,'Another account suspension has no effect');
 e.setError(new Error('Verification unavailable'));await e.rules.reload();assert.equal(e.rules.status().ready,false);assert.equal(e.rules.canTake(target,photo),false,'A failed refresh invalidates previous approval');
 e.document.getElementById('app').innerHTML='<div class="match"><button data-act="take" data-id="target">Tomar partido</button></div>';let originalAction=0;e.document.addEventListener('click',()=>{originalAction++;});
 e.document.querySelector('button').dispatchEvent(new e.window.MouseEvent('click',{bubbles:true,cancelable:true}));assert.equal(originalAction,0,'Capture guard prevents the original assignment action');assert.equal(e.S.matches[0].f1,photo.id,'Blocked selection does not change assignments');assert.match(e.S.banner,/Confirma tu disponibilidad/);
 }finally{await e.close();}}
async function payroll(){const e=await environment('admin');try{
 const good=match('clocked',10),blocked=match('unclocked',40),unfinished=match('unfinished',5,{stage:''});e.S.matches=[good,blocked,unfinished];const original=e.S.matches,payments=JSON.stringify(e.S.pays);
 let result=e.rules.calc(e.base,editor,week);assert.equal(result.lines.length,0,'No editing line is payable without verified server state');assert.match(result.notes.join(' '),/verificación del cronómetro/);
 e.setReply({...empty(),clock:[{editor_id:editor.id,match_id:'clocked',seconds:180},{editor_id:editor.id,match_id:'unfinished',seconds:90},{editor_id:otherEditor.id,match_id:'unclocked',seconds:999}]});await e.rules.reload();
 result=e.rules.calc(e.base,editor,week);assert.deepEqual(Array.from(result.lines,line=>line.mid),['clocked'],'Only completed, clocked work is payable');assert.equal(result.total,70,'Filtering before calculation selects the correct 10-player tier at 7 per player');assert.equal(result.lines[0].players,10);assert.equal(result.lines[0].rate,7);assert.ok(result.skipped.some(s=>s.includes('unclocked')));
 assert.equal(e.S.matches,original,'The matches array identity is restored');assert.equal(e.S.matches.length,3);assert.equal(JSON.stringify(e.S.pays),payments,'Approved payment snapshots are untouched');
 assert.equal(e.rules.clocked(editor.id,'unclocked'),false,'Time belongs to its own editor');assert.equal(e.rules.clocked(editor.id,'other-match'),false,'Time belongs to its own match');
 e.setReply({...empty(),clock:[{editor_id:editor.id,match_id:'clocked',seconds:0}]});await e.rules.reload();assert.equal(e.rules.clocked(editor.id,'clocked'),false,'Zero time never qualifies');
 assert.throws(()=>e.rules.calc(()=>{throw Error('Original payroll error');},editor,week),/Original payroll error/);assert.equal(e.S.matches,original,'Array restoration also holds if payroll throws');
 let called=false;const marker={lines:[],total:123};assert.equal(e.rules.calc(()=>{called=true;return marker;},photo,week),marker);assert.ok(called,'Photographer calculation remains unchanged');
 }finally{await e.close();}}
async function accountIsolation(){const e=await environment();try{
 let resolveOld;const old=new Promise(resolve=>{resolveOld=resolve;});e.setWaiter(old);const first=e.rules.reload();
 e.setUser(null);e.rules.afterRender();assert.equal(e.rules.status().ready,false);assert.equal(e.rules.status().loading,false);
 const replacement={...photo,id:'photo-b'};e.setUser(replacement);let resolveNew;const next=new Promise(resolve=>{resolveNew=resolve;});e.setWaiter(next);const second=e.rules.reload();
 resolveOld({...empty(),availability:[schedule()]});await first;assert.equal(e.rules.status().ready,false,'An old account response cannot populate the new account');
 resolveNew({...empty(),availability:[schedule({photographer_id:replacement.id})]});await second;assert.equal(e.rules.canTake(match('new'),replacement),true);
 e.setUser({...replacement,role:'editora'});e.setWaiter(null);e.setReply(empty());e.rules.afterRender();assert.equal(e.rules.canTake(match('new'),replacement),false,'Changing the role invalidates cached availability immediately');
 e.setUser(null);e.rules.afterRender();assert.equal(e.rules.clocked(editor.id,'clocked'),false);assert.equal(e.rules.status().ready,false);
 }finally{await e.close();}}
async function ownershipAndAdmin(){const e=await environment('admin');try{
 const stale=match('reassigned',10,{ed:otherEditor.id,edBy:editor.id});e.S.matches=[stale];assert.equal(e.base(editor,week).total,70,'Fixture exercises the legacy edBy fallback');
 e.setReply(empty());await e.rules.reload();assert.equal(e.rules.calc(e.base,editor,week).total,0,'A former editor cannot be paid for work assigned to another editor');
 e.setReply({...empty(),clock:[{editor_id:editor.id,match_id:stale.id,seconds:100}]});await e.rules.reload();assert.equal(e.rules.calc(e.base,editor,week).total,0,'An old clock does not override the current editor assignment');
 const admin={id:'admin',role:'admin',name:'Administración'};e.S.users.push(admin);const editing=match('admin-edit',10,{ed:admin.id,edBy:''});e.S.matches=[editing];
 e.setReply(empty());await e.rules.reload();assert.equal(e.rules.calc(e.base,admin,week).total,0,'Administrative editing also requires original clock evidence');
 e.setReply({...empty(),clock:[{editor_id:admin.id,match_id:editing.id,seconds:75}]});await e.rules.reload();assert.equal(e.rules.calc(e.base,admin,week).total,70,'Administrative editing retains the player-based rate once clocked');
 const photography=match('admin-photo',20,{f1:admin.id,ed:otherEditor.id});e.S.matches=[photography];e.setReply(empty());await e.rules.reload();assert.equal(e.rules.calc(e.base,admin,week).total,200,'Administrative photography preserves its existing calculation without an editing clock');
 }finally{await e.close();}}
function sqlContract(){
 assert.match(migration,/kind='original' and status in \('paused','expired'\) and active_seconds>0/,'Server clock evidence excludes active, zero and correction sessions');
 assert.match(migration,/a\.week_start=date_trunc\('week',p_day\)::date/,'Server availability is scoped to the match week');
 assert.match(migration,/tsi225_private\.is_suspended\(p_uid,p_day\)/,'Suspension is enforced in the write trigger');
 assert.match(migration,/Existing approved payments keep their status\/review\/settlement workflow/);
 assert.match(migration,/new\.data->'lines',new\.data->'total',new\.owner/,'Existing payment preservation compares amounts and ownership');
 assert.match(migration,/stage' is distinct from 'listos'/,'The server requires concluded editing');
 assert.match(migration,/if seconds<=0 then raise exception/,'The server fails closed without original clock evidence');
 assert.match(migration,/create trigger tsi230_guard_photo_selection before insert or update/);
 assert.match(migration,/create trigger tsi230_guard_editor_pay before insert or update/);
 assert.match(migration,/r not in \('admin','foto','editora'\)/,'Anonymous and pending accounts cannot read rule state');
}
(async()=>{const entry=require.resolve('happy-dom',{paths:[root,path.resolve(root,'../tanabisport')]});({Window}=await import(pathToFileURL(entry).href));await selection();await payroll();await accountIsolation();await ownershipAndAdmin();sqlContract();console.log('TSI 2.3.0 rules: fail-closed weekly availability, suspension, guarded selection, real payroll rates after clock filtering, current editor ownership, administrative editing/photography, array restoration, approved snapshots and account races verified. SQL write contracts checked statically.');})().catch(error=>{console.error(error);process.exitCode=1;});

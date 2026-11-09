// A scheduled runner must call this guard immediately before every remote mutation.
// It never publishes, waits, or changes the machine's clock.
const target='2026-11-09T00:00:00-06:00',zone='America/Monterrey';
const start=Date.parse(target),end=start+60*60*1000;
function status(now=new Date()){
 const instant=now instanceof Date?now:new Date(now),ms=instant.getTime();
 if(!Number.isFinite(ms))throw Error('Fecha de ejecución inválida.');
 return {target,timezone:zone,utc:new Date(start).toISOString(),now:instant.toISOString(),allowed:ms>=start&&ms<end,reason:ms<start?'not_yet':ms>=end?'window_closed':'authorized_window'};
}
function assertWindow(now){const current=status(now);if(!current.allowed)throw Error(current.reason==='not_yet'?'El lanzamiento no puede empezar antes del 9 de noviembre de 2026 a las 00:00 de Monterrey.':'La ventana de este lanzamiento terminó; no publicar en otra fecha sin una nueva instrucción.');return current;}
if(require.main===module){try{const current=process.argv.includes('--status')?status():assertWindow();console.log(JSON.stringify(current));}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={target,zone,start,end,status,assertWindow};

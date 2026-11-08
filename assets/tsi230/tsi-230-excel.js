/* The existing vendored SheetJS build is fetched only when importing Excel. */
(function(root){'use strict';
 var pending=null;
 root.TSI230Excel={load:function(){
  if(root.XLSX&&typeof root.XLSX.read==='function')return Promise.resolve(root.XLSX);
  if(pending)return pending;
  pending=new Promise(function(resolve,reject){
   var script=document.createElement('script');script.src='assets/tsi230/vendor/xlsx-embedded.js?v=230-light';script.async=true;
   script.onload=function(){if(root.XLSX&&typeof root.XLSX.read==='function')resolve(root.XLSX);else failed();};
   function failed(){script.remove();pending=null;reject(new Error('No se pudo cargar la herramienta de Excel. Revisa tu conexión y vuelve a seleccionar el archivo.'));}
   script.onerror=failed;document.head.appendChild(script);
  });
  return pending;
 }};
})(window);

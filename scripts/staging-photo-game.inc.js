/* Este bloque se inserta solo en el arranque de staging por build-staging.py. */
var PG=null;
if(window.TSIPhotoGame&&window.TSIPhotoGameModel&&SBU==='https://nksqpoigywfegcbvfhoa.supabase.co'){
 PG=window.TSIPhotoGame.create({me:me,server:SBU,render:function(){render();},imageBase:'photo-game-scenes/'});
 var pgBaseTabs=tabsFor;tabsFor=function(role){var list=pgBaseTabs(role);if(['admin','foto','editora'].includes(role))list.push(['fotojuego','Reto fotográfico']);return list;};
 var pgBaseView=viewDash;viewDash=function(){
  if(S.tab!=='fotojuego'||!me()||!['admin','foto','editora'].includes(me().role))return pgBaseView();
  return topbar()+'<div class="ti-section-head">'+tabsBar()+'<h1>Reto fotográfico</h1></div>'+PG.render()+'<footer>Progreso guardado en este navegador. · Versión '+APP_VERSION+'</footer>';
 };
 var pgBaseSummary=tabResumen;tabResumen=function(){var html=pgBaseSummary();if(me()&&['admin','foto','editora'].includes(me().role))html=html.replace(/(<nav class="d29-actions"[^>]*>)/,'$1'+d29Action('fotojuego','Reto fotográfico','Entrena tu ojo y tu cámara','camera'));return html;};
 var pgBaseRender=render;render=function(){var active=document.activeElement,focusId=active&&active.closest('.pg-shell')?active.id:'',focusAction=active&&active.closest('.pg-shell')?active.getAttribute('data-pg-action'):'';pgBaseRender();if(S.view==='dash'&&S.tab==='fotojuego'){PG.afterRender();var restored=focusId?document.getElementById(focusId):focusAction?document.querySelector('[data-pg-action="'+focusAction+'"]'):null;if(restored)restored.focus({preventScroll:true});}};
}

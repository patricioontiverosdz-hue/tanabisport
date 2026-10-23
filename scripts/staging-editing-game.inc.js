/* Laboratorio de edición: se instala exclusivamente en staging. */
var EG=null;
if(window.TSIEditingGame&&window.TSIEditingGameModel&&window.TSIEditingRenderer&&SBU==='https://nksqpoigywfegcbvfhoa.supabase.co'){
 EG=window.TSIEditingGame.create({me:me,server:SBU,render:function(){render();},imageBase:'photo-game-scenes/',ranking:GR});
 var egBaseTabs=tabsFor;tabsFor=function(role){var list=egBaseTabs(role);if(['admin','foto','editora'].includes(role))list.push(['edicionjuego','Reto de edición']);return list;};
 var egBaseView=viewDash;viewDash=function(){
  if(S.tab!=='edicionjuego'||!me()||!['admin','foto','editora'].includes(me().role))return egBaseView();
  return topbar()+'<div class="ti-section-head">'+tabsBar()+'<h1>Reto de edición</h1></div>'+EG.render()+'<footer>Progreso guardado en este navegador. · Versión '+APP_VERSION+'</footer>';
 };
 var egBaseSummary=tabResumen;tabResumen=function(){var html=egBaseSummary();if(me()&&['admin','foto','editora'].includes(me().role))html=html.replace(/(<nav class="d29-actions"[^>]*>)/,'$1'+d29Action('edicionjuego','Reto de edición','Luz, color y encuadre','camera'));return html;};
 var egBaseRender=render;render=function(){var active=document.activeElement,focusId=active&&active.closest('.eg-shell')?active.id:'',focusAction=active&&active.closest('.eg-shell')?active.getAttribute('data-eg-action'):'';egBaseRender();if(S.view==='dash'&&S.tab==='edicionjuego'){EG.afterRender();var restored=focusId?document.getElementById(focusId):focusAction?document.querySelector('[data-eg-action="'+focusAction+'"]'):null;if(restored)restored.focus({preventScroll:true});}};
}

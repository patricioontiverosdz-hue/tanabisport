/* Podio interno de entrenamiento: exclusivamente staging. */
if(GR&&SBU==='https://nksqpoigywfegcbvfhoa.supabase.co'){
 var grBaseTabs=tabsFor;tabsFor=function(role){var list=grBaseTabs(role);if(['admin','foto','editora'].includes(role))list.push(['rankingjuegos','Podio del equipo']);return list;};
 var grBaseView=viewDash;viewDash=function(){
  if(S.tab!=='rankingjuegos'||!me()||!['admin','foto','editora'].includes(me().role))return grBaseView();
  return topbar()+'<div class="ti-section-head">'+tabsBar()+'<h1>Podio del equipo</h1></div>'+GR.render()+'<footer>Versión '+APP_VERSION+'</footer>';
 };
 var grBaseSummary=tabResumen;tabResumen=function(){var html=grBaseSummary();if(me()&&['admin','foto','editora'].includes(me().role))html=html.replace(/(<nav class="d29-actions"[^>]*>)/,'$1'+d29Action('rankingjuegos','Podio del equipo','Las mejores marcas de cámara y edición','camera'));return html;};
 var grBaseRender=render;render=function(){grBaseRender();if(S.view==='dash'&&S.tab==='rankingjuegos')GR.afterRender();};
}

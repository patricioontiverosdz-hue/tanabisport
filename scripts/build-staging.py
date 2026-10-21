"""Genera staging desde el mismo código, preservando el aislamiento de servidor y sesión."""
from pathlib import Path

root=Path(__file__).resolve().parents[1]
stage=(root/'index.html').read_text().replace('tantlgswituiwkxfgmsr','nksqpoigywfegcbvfhoa').replace('sb_publishable_eR9jVjr1Ut2bNrR5u08Wcg_5iqPaxoH','sb_publishable_MJmF_vGzwS43RRDFtSpHGw_K106L1NE').replace('tsi_production_','tsi_staging_').replace('PRODUCCIÓN','STAGING').replace('producción','staging').replace('APP_VERSION="2.1.0"','APP_VERSION="2.1.0-staging"')
stage=stage.replace('href="assets/','href="../assets/').replace('src="assets/','src="../assets/')
stage=stage.replace('var configError=stagingConfigError();',"var tsiStage210Top=topbar;topbar=function(){return '<div class=\"note\"><strong>STAGING · Pruebas 2.1.0</strong> · Datos y sesión de prueba.</div>'+tsiStage210Top();};\nvar configError=stagingConfigError();",1)
assert 'tantlgswituiwkxfgmsr' not in stage and 'tsi_production_' not in stage
(root/'staging/index.html').write_text(stage)
print('Staging generado desde el código actual, con servidor y sesión separados.')

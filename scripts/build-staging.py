"""Genera staging desde el código actual, con servidor, recursos y sesión propios."""
from training_build import ROOT, strip_training, add_training
import re

root=ROOT
source=strip_training((root/'index.html').read_text(encoding='utf-8'))
source_version=re.search(r'var APP_VERSION="([^"]+)"',source).group(1)
version='2.2.0'
stage=source.replace('tantlgswituiwkxfgmsr','nksqpoigywfegcbvfhoa').replace('sb_publishable_eR9jVjr1Ut2bNrR5u08Wcg_5iqPaxoH','sb_publishable_MJmF_vGzwS43RRDFtSpHGw_K106L1NE').replace('tsi_production_','tsi_staging_').replace('PRODUCCIÓN','STAGING').replace('producción','staging').replace('APP_VERSION="'+source_version+'"','APP_VERSION="'+version+'-staging"')
stage=stage.replace('href="assets/','href="../assets/').replace('src="assets/','src="../assets/')
banner="var tsiStage210Top=topbar;topbar=function(){return '<div class=\"note\"><strong>STAGING · Pruebas "+version+"</strong> · Datos y sesión de prueba.</div>'+tsiStage210Top();};\n"
stage=add_training(stage,'staging',banner)
assert 'tantlgswituiwkxfgmsr' not in stage and 'tsi_production_' not in stage
(root/'staging/index.html').write_text(stage,encoding='utf-8')
print('Staging generado con servidor y sesión separados.')

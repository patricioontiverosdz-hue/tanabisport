"""Prepara TSI 2.2.0; publicar solo con autorización o en el horario acordado."""
from training_build import ROOT, STAGE_ID, strip_training, add_training, production_assets
import re

source=strip_training((ROOT/'index.html').read_text(encoding='utf-8'))
source=re.sub(r'var APP_VERSION="[^"]+"','var APP_VERSION="2.2.0"',source,count=1)
source=re.sub(r'<title>Tanabi Sports Intelligence[^<]*</title>','<title>Tanabi Sports Intelligence 2.2.0</title>',source,count=1)
source=add_training(source,'production')
assert STAGE_ID not in source and 'tsi_staging_' not in source
assert 'APP_VERSION="2.2.0"' in source and 'training/game-ranking.js' in source
production_assets()
(ROOT/'index.html').write_text(source,encoding='utf-8')
print('Producción 2.2.0 preparada con recursos y sesión propios.')

"""Genera staging desde el mismo código, preservando el aislamiento de servidor y sesión."""
from pathlib import Path
import re

root=Path(__file__).resolve().parents[1]
source=(root/'index.html').read_text(encoding='utf-8')
source_version=re.search(r'var APP_VERSION="([^"]+)"',source).group(1)
version='2.2.0'
stage=source.replace('tantlgswituiwkxfgmsr','nksqpoigywfegcbvfhoa').replace('sb_publishable_eR9jVjr1Ut2bNrR5u08Wcg_5iqPaxoH','sb_publishable_MJmF_vGzwS43RRDFtSpHGw_K106L1NE').replace('tsi_production_','tsi_staging_').replace('PRODUCCIÓN','STAGING').replace('producción','staging').replace('APP_VERSION="'+source_version+'"','APP_VERSION="'+version+'-staging"')
stage=stage.replace('href="assets/','href="../assets/').replace('src="assets/','src="../assets/')
game_assets='<link rel="stylesheet" href="game-ranking.css?v=220">\n<script src="game-ranking.js?v=220"></script>\n'
game_assets+='<link rel="stylesheet" href="photo-game.css?v=220">\n<script src="photo-game-model.js?v=220"></script>\n<script src="photo-game.js?v=220"></script>\n'
game_assets+='<link rel="stylesheet" href="editing-game.css?v=220">\n<script src="editing-game-model.js?v=221"></script>\n<script src="editing-game-renderer.js?v=220"></script>\n<script src="editing-game.js?v=220"></script>\n'
stage=stage.replace('\n</head>\n<body>', '\n'+game_assets+'</head>\n<body>',1)
stage=stage.replace("['TSI y configuración'", "['Entrenamiento',['fotojuego','edicionjuego','rankingjuegos']],['TSI y configuración'",1)
game_hook=(root/'scripts/staging-photo-game.inc.js').read_text(encoding='utf-8')
game_hook+='\n'+(root/'scripts/staging-editing-game.inc.js').read_text(encoding='utf-8')
game_hook+='\n'+(root/'scripts/staging-game-ranking.inc.js').read_text(encoding='utf-8')
banner="var tsiStage210Top=topbar;topbar=function(){return '<div class=\"note\"><strong>STAGING · Pruebas "+version+"</strong> · Datos y sesión de prueba.</div>'+tsiStage210Top();};\n"
stage=stage.replace('var configError=stagingConfigError();',game_hook+'\n'+banner+'var configError=stagingConfigError();',1)
assert 'tantlgswituiwkxfgmsr' not in stage and 'tsi_production_' not in stage
(root/'staging/index.html').write_text(stage,encoding='utf-8')
print('Staging generado desde el código actual, con servidor y sesión separados.')

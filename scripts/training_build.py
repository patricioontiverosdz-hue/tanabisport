"""Generación de los mismos juegos con recursos y guardas propios por entorno."""
from pathlib import Path
import re
import shutil

ROOT=Path(__file__).resolve().parents[1]
STAGE_ID='nksqpoigywfegcbvfhoa'
PRODUCTION_ID='tantlgswituiwkxfgmsr'
ASSETS=[('game-ranking.css','220'),('game-ranking.js','220'),('photo-game.css','220'),
        ('photo-game-model.js','220'),('photo-game.js','220'),('editing-game.css','220'),
        ('editing-game-model.js','221'),('editing-game-renderer.js','220'),('editing-game.js','220')]
GROUP="['Entrenamiento',['fotojuego','edicionjuego','rankingjuegos']],"

def strip_training(source):
    source=re.sub(r'<!-- TSI_TRAINING_ASSETS_START -->.*?<!-- TSI_TRAINING_ASSETS_END -->\n?', '', source, flags=re.S)
    source=re.sub(r'/\* TSI_TRAINING_HOOKS_START \*/.*?/\* TSI_TRAINING_HOOKS_END \*/\n?', '', source, flags=re.S)
    return source.replace(GROUP,'')

def for_production(text):
    return text.replace(STAGE_ID,PRODUCTION_ID).replace('tsi_staging_','tsi_production_').replace('STAGING','PRODUCTION').replace('staging','producción')

def add_training(source,environment,banner=''):
    prefix='training/' if environment=='production' else ''
    tags=[]
    for name,version in ASSETS:
        url=prefix+name+'?v='+version
        tags.append('<link rel="stylesheet" href="'+url+'">' if name.endswith('.css') else '<script src="'+url+'"></script>')
    assets='<!-- TSI_TRAINING_ASSETS_START -->\n'+'\n'.join(tags)+'\n<!-- TSI_TRAINING_ASSETS_END -->\n'
    assert '\n</head>\n<body>' in source
    source=source.replace('\n</head>\n<body>','\n'+assets+'</head>\n<body>',1)
    source=source.replace("['TSI y configuración'",GROUP+"['TSI y configuración'",1)
    hooks='\n'.join((ROOT/'scripts'/name).read_text(encoding='utf-8') for name in
                    ['staging-photo-game.inc.js','staging-editing-game.inc.js','staging-game-ranking.inc.js'])
    if environment=='production':
        hooks=for_production(hooks).replace("imageBase:'photo-game-scenes/'","imageBase:'training/photo-game-scenes/'")
    hooks='/* TSI_TRAINING_HOOKS_START */\n'+hooks+'\n'+banner+'/* TSI_TRAINING_HOOKS_END */\n'
    return source.replace('var configError=stagingConfigError();',hooks+'var configError=stagingConfigError();',1)

def production_assets():
    target=ROOT/'training'
    target.mkdir(exist_ok=True)
    for name,_ in ASSETS:
        text=for_production((ROOT/'staging'/name).read_text(encoding='utf-8'))
        text=text.replace('<span class="pg-trial">EN PRUEBA</span>','').replace('<span class="eg-trial">EN PRUEBA</span>','')
        text=text.replace("||'photo-game-scenes/'","||'training/photo-game-scenes/'")
        (target/name).write_text(text,encoding='utf-8')
    photos=target/'photo-game-scenes'
    photos.mkdir(exist_ok=True)
    for source in (ROOT/'staging/photo-game-scenes').glob('*.jpg'):
        shutil.copy2(source,photos/source.name)

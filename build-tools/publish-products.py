"""Publish complete verified binary sets, then atomically advertise the catalog."""
import base64, hashlib, json, os, pathlib, subprocess
ROOT=pathlib.Path('downloads')
REPO='Azizbek-dsgn/Meyor-Releases'
TEMPO_REV='49deedc4169ba3224a4582fdac6f933182de56a9'
UZ_REV='2a9350ff66624504d4d9328bc9ccb93d6f6a6c4c'
def gh(*args):
    return subprocess.check_output(['gh',*args],text=True,encoding='utf-8')
def api(endpoint):return json.loads(gh('api',endpoint))
old=api(f'repos/{REPO}/contents/catalog.json')
catalog=json.loads(base64.b64decode(old['content']))
for product,version,revision in [('tempo','0.2.0',TEMPO_REV),('uzscribe','0.8.6',UZ_REV)]:
    name='Tempo' if product=='tempo' else 'UzScribe'
    tag=f'{product}-v{version}-{revision[:7]}'
    assets={}; files=[]
    for platform in ['win-x64','mac-arm64','mac-x64']:
        suffix='.zip' if product=='uzscribe' else ('.exe' if platform=='win-x64' else '.dmg')
        file=ROOT/platform/f'{name}-{version}-{platform}{suffix}'
        data=file.read_bytes()
        if not data:raise RuntimeError('Missing build payload')
        assets[platform]={'url':f'https://github.com/{REPO}/releases/download/{tag}/{file.name}',
            'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
        files.append(str(file))
    existing=json.loads(gh('release','list','--repo',REPO,'--limit','100','--json','tagName'))
    if tag not in [r['tagName'] for r in existing]:
        gh('release','create',tag,'--repo',REPO,'--draft','--title',f'{name} {version}',
            '--notes',f'Compiled packages for Windows x64, Intel Mac and Apple Silicon Mac. Source revision: {revision}. Existing user data and UzScribe models remain in their selected location. Unsigned distribution.')
        gh('release','upload',tag,'--repo',REPO,*files)
    release_id=json.loads(gh('release','view',tag,'--repo',REPO,'--json','databaseId'))['databaseId']
    release=api(f'repos/{REPO}/releases/{release_id}')
    published={a['name']:a for a in release['assets']}
    for key, asset in assets.items():
        info=published[pathlib.PurePosixPath(asset['url']).name]
        if info['size']!=asset['bytes'] or info.get('digest')!='sha256:'+asset['sha256']:
            raise RuntimeError('Release asset integrity mismatch')
    gh('release','edit',tag,'--repo',REPO,'--draft=false','--latest=false')
    value={'version':version,'revision':revision,'channel':'beta','assets':assets}
    catalog[product]=value
    if product=='uzscribe':catalog['uzscribeDesktop']={**value,'desktop':True}
# Preserve concurrent catalog changes; GitHub contents update enforces the SHA lease.
request={'message':'Publish Tempo 0.2.0 and UzScribe 0.8.6 native packages',
         'sha':old['sha'],'content':base64.b64encode((json.dumps(catalog,indent=2)+'\n').encode()).decode()}
pathlib.Path('catalog-request.json').write_text(json.dumps(request),encoding='utf-8')
gh('api',f'repos/{REPO}/contents/catalog.json','--method','PUT','--input','catalog-request.json')
print('Complete verified releases published and update catalog committed.')

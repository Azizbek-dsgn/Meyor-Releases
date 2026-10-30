"""Publish a complete verified product set and advertise it under catalog.products.

Meyor 0.5.0+ installs these without a code change. Requires all three platforms.
"""
import base64, hashlib, json, os, pathlib, re, subprocess
ROOT = pathlib.Path('downloads')
REPO = 'Azizbek-dsgn/Meyor-Releases'
PRODUCT, VERSION = os.environ['PRODUCT'], os.environ['PRODUCT_VERSION']
BUILT_IN = {'uzscribe', 'uzscribe-desktop', 'tempo', 'meyor', 'log', 'github', 'donate'}
EXT = {'mac-arm64': ('.dmg', '.zip'), 'mac-x64': ('.dmg', '.zip'), 'win-x64': ('.zip', '.exe')}

def gh(*args):
    return subprocess.check_output(['gh', *args], text=True, encoding='utf-8')

def api(endpoint):
    return json.loads(gh('api', endpoint))

assert re.fullmatch(r'[a-z0-9][a-z0-9-]{1,40}', PRODUCT) and PRODUCT not in BUILT_IN
assert re.fullmatch(r'\d+\.\d+\.\d+', VERSION)
revisions = {(ROOT / p / 'SOURCE_REVISION').read_text().strip() for p in EXT}
if len(revisions) != 1:
    raise RuntimeError('Platformalar turli commitdan yig‘ilgan.')
REVISION = revisions.pop()
assert re.fullmatch(r'[0-9a-f]{40}', REVISION)
meta = json.loads((ROOT / 'mac-arm64' / 'meyor.json').read_text(encoding='utf-8'))
assert meta['id'] == PRODUCT

tag = f'{PRODUCT}-v{VERSION}-{REVISION[:7]}'
assets, files = {}, []
for platform, allowed in EXT.items():
    found = [f for f in (ROOT / platform).iterdir() if f.name.startswith(f'{PRODUCT}-{VERSION}-{platform}') and f.suffix.lower() in allowed]
    if len(found) != 1:
        raise RuntimeError(f'{platform}: bitta paket kutilgan.')
    data = found[0].read_bytes()
    assets[platform] = {'url': f'https://github.com/{REPO}/releases/download/{tag}/{found[0].name}',
                        'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    files.append(str(found[0]))

old = api(f'repos/{REPO}/contents/catalog.json')
catalog = json.loads(base64.b64decode(old['content']))
existing = json.loads(gh('release', 'list', '--repo', REPO, '--limit', '100', '--json', 'tagName'))
if tag not in [r['tagName'] for r in existing]:
    gh('release', 'create', tag, '--repo', REPO, '--draft', '--title', f"{meta['name']} {VERSION}",
       '--notes', f"Compiled packages for Windows x64, Intel Mac and Apple Silicon Mac. Install with Meyor 0.5.0 or newer. Source revision: {REVISION}. Unsigned distribution.")
    gh('release', 'upload', tag, '--repo', REPO, *files)
release_id = json.loads(gh('release', 'view', tag, '--repo', REPO, '--json', 'databaseId'))['databaseId']
published = {a['name']: a for a in api(f'repos/{REPO}/releases/{release_id}')['assets']}
for asset in assets.values():
    info = published[pathlib.PurePosixPath(asset['url']).name]
    if info['size'] != asset['bytes'] or info.get('digest') != 'sha256:' + asset['sha256']:
        raise RuntimeError('Release asset integrity mismatch')
gh('release', 'edit', tag, '--repo', REPO, '--draft=false', '--latest=false')

entry = {k: meta[k] for k in ('name', 'detail', 'note', 'host', 'mac', 'win') if k in meta}
entry.update(version=VERSION, revision=REVISION, channel=meta.get('channel', 'beta'), assets=assets)
catalog.setdefault('products', {})[PRODUCT] = entry
request = {'message': f"Publish {meta['name']} {VERSION}", 'sha': old['sha'],
           'content': base64.b64encode((json.dumps(catalog, indent=2, ensure_ascii=False) + '\n').encode()).decode()}
pathlib.Path('catalog-request.json').write_text(json.dumps(request), encoding='utf-8')
gh('api', f'repos/{REPO}/contents/catalog.json', '--method', 'PUT', '--input', 'catalog-request.json')
print(f"{meta['name']} {VERSION} published; Meyor shows it on the next check.")

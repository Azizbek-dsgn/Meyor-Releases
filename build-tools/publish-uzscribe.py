"""Publish a complete verified UzScribe binary set, then atomically advertise it in the catalog."""
import base64, hashlib, json, os, pathlib, re, subprocess
ROOT = pathlib.Path('downloads')
REPO = 'Azizbek-dsgn/Meyor-Releases'
VERSION = os.environ['UZSCRIBE_VERSION']
REVISION = os.environ['SOURCE_REVISION']
assert re.fullmatch(r'\d+\.\d+\.\d+', VERSION) and re.fullmatch(r'[0-9a-f]{40}', REVISION)

def gh(*args):
    return subprocess.check_output(['gh', *args], text=True, encoding='utf-8')

def api(endpoint):
    return json.loads(gh('api', endpoint))

old = api(f'repos/{REPO}/contents/catalog.json')
catalog = json.loads(base64.b64decode(old['content']))
tag = f'uzscribe-v{VERSION}-{REVISION[:7]}'
assets, files = {}, []
for platform in ['win-x64', 'mac-arm64', 'mac-x64']:
    file = ROOT/platform/f'UzScribe-{VERSION}-{platform}.zip'
    data = file.read_bytes()
    if not data:
        raise RuntimeError('Missing build payload')
    assets[platform] = {'url': f'https://github.com/{REPO}/releases/download/{tag}/{file.name}',
                        'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    files.append(str(file))
existing = json.loads(gh('release', 'list', '--repo', REPO, '--limit', '100', '--json', 'tagName'))
if tag not in [r['tagName'] for r in existing]:
    gh('release', 'create', tag, '--repo', REPO, '--draft', '--title', f'UzScribe {VERSION}',
       '--notes', f'Compiled packages for Windows x64, Intel Mac and Apple Silicon Mac. Includes UzScribe Diktant (push-to-talk dictation). Source revision: {REVISION}. Existing user data and UzScribe models remain in their selected location. Unsigned distribution.')
    gh('release', 'upload', tag, '--repo', REPO, *files)
release_id = json.loads(gh('release', 'view', tag, '--repo', REPO, '--json', 'databaseId'))['databaseId']
published = {a['name']: a for a in api(f'repos/{REPO}/releases/{release_id}')['assets']}
for asset in assets.values():
    info = published[pathlib.PurePosixPath(asset['url']).name]
    if info['size'] != asset['bytes'] or info.get('digest') != 'sha256:' + asset['sha256']:
        raise RuntimeError('Release asset integrity mismatch')
gh('release', 'edit', tag, '--repo', REPO, '--draft=false', '--latest=false')
value = {'version': VERSION, 'revision': REVISION, 'channel': 'beta', 'assets': assets}
catalog['uzscribe'] = value
catalog['uzscribeDesktop'] = {**value, 'desktop': True}
# GitHub contents update enforces the SHA lease, so concurrent catalog edits are not lost.
request = {'message': f'Publish UzScribe {VERSION} native packages', 'sha': old['sha'],
           'content': base64.b64encode((json.dumps(catalog, indent=2) + '\n').encode()).decode()}
pathlib.Path('catalog-request.json').write_text(json.dumps(request), encoding='utf-8')
gh('api', f'repos/{REPO}/contents/catalog.json', '--method', 'PUT', '--input', 'catalog-request.json')
print(f'UzScribe {VERSION} published and update catalog committed.')

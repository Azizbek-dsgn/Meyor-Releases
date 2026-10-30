"""Publish a verified Meyor app release (all three installers) and advertise it in catalog.meyor."""
import base64, hashlib, json, os, pathlib, re, subprocess
REPO = 'Azizbek-dsgn/Meyor-Releases'
VERSION = os.environ['PRODUCT_VERSION']
assert re.fullmatch(r'\d+\.\d+\.\d+', VERSION)
root = pathlib.Path('downloads')

def gh(*args):
    return subprocess.check_output(['gh', *args], text=True, encoding='utf-8')

files = {p.name: p for p in root.rglob('*') if p.is_file()}
revisions = {p.read_text().strip() for p in root.rglob('SOURCE_REVISION')}
assert len(revisions) == 1
REVISION = revisions.pop(); assert re.fullmatch(r'[0-9a-f]{40}', REVISION)
assets, upload = {}, []
for key in ['mac-arm64', 'mac-x64', 'win-x64']:
    name = f"Meyor-{VERSION}-{key}.{'exe' if key == 'win-x64' else 'dmg'}"
    data = files[name].read_bytes()
    assets[key] = {'url': f'https://github.com/{REPO}/releases/download/v{VERSION}/{name}', 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
    upload.append(files[name])
installer = files.get('Install-Meyor-mac.sh')
sums = root/'SHA256SUMS'
sums.write_text(''.join(f"{a['sha256']}  {pathlib.PurePosixPath(a['url']).name}\n" for a in assets.values()) +
                (f"{hashlib.sha256(installer.read_bytes()).hexdigest()}  Install-Meyor-mac.sh\n" if installer else ''))
upload += [sums] + ([installer] if installer else [])
tag = f'v{VERSION}'
existing = [r['tagName'] for r in json.loads(gh('release', 'list', '--repo', REPO, '--limit', '100', '--json', 'tagName'))]
if tag not in existing:
    gh('release', 'create', tag, '--repo', REPO, '--draft', '--title', f'Meyor {VERSION}',
       '--notes', f'Meyor {VERSION} for Apple Silicon Mac, Intel Mac and Windows x64. Source revision: {REVISION}. Mac builds are ad-hoc signed, Windows builds unsigned.')
    gh('release', 'upload', tag, '--repo', REPO, *map(str, upload))
release = json.loads(gh('api', f"repos/{REPO}/releases/{json.loads(gh('release', 'view', tag, '--repo', REPO, '--json', 'databaseId'))['databaseId']}"))
published = {a['name']: a for a in release['assets']}
for a in assets.values():
    info = published[pathlib.PurePosixPath(a['url']).name]
    if info['size'] != a['bytes'] or info.get('digest') != 'sha256:' + a['sha256']:
        raise RuntimeError('Release asset integrity mismatch')
gh('release', 'edit', tag, '--repo', REPO, '--draft=false', '--latest')
current = json.loads(gh('api', f'repos/{REPO}/contents/catalog.json'))
catalog = json.loads(base64.b64decode(current['content']))
catalog['meyor'] = {'version': VERSION, 'revision': REVISION, 'assets': assets}
request = {'message': f'Publish Meyor {VERSION} update catalog', 'sha': current['sha'],
           'content': base64.b64encode((json.dumps(catalog, indent=2, ensure_ascii=False) + '\n').encode()).decode()}
pathlib.Path('catalog-request.json').write_text(json.dumps(request), encoding='utf-8')
gh('api', f'repos/{REPO}/contents/catalog.json', '--method', 'PUT', '--input', 'catalog-request.json')
print(f'Meyor {VERSION} published; existing Meyor apps offer the update on their next check.')

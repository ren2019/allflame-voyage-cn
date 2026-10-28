#!/usr/bin/env python3
"""Build reproducible, unpublished Windows collector candidates from fixed inputs."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def build(output, full=False, components=None, download=False):
    release = json.loads((ROOT / 'public/collector-release.json').read_text())
    ocr = json.loads((ROOT / 'public/collector/ocr-runtime.json').read_text())
    runtime = json.loads((ROOT / 'public/collector/install-runtime.json').read_text())
    dependencies = [runtime['autoHotkey'], ocr['python'], *ocr['packages'], runtime['visualCpp']]
    output.mkdir(parents=True, exist_ok=True)
    cache = components or output / 'component-cache'
    with tempfile.TemporaryDirectory(prefix='voyage-candidate-') as tmp:
        stage = Path(tmp)
        payload = stage / 'payload'
        payload.mkdir()
        shutil.copy2(ROOT / 'public' / release['script'], payload / release['script'])
        shutil.copy2(ROOT / 'public/collector-release.json', payload / 'collector-release.json')
        shutil.copytree(ROOT / 'public/collector', payload / 'collector',
                        ignore=shutil.ignore_patterns('installer', '__pycache__', '*.pyc'))
        for file in (ROOT / 'public/collector/installer').iterdir():
            if file.is_file():
                if file.name == '使用说明.html':
                    # Keep the website copy authoritative; file:// needs metadata
                    # embedded from the same release manifest rather than fetch.
                    guide = file.read_text(encoding='utf-8')
                    bundled = json.dumps(release, ensure_ascii=False).replace('<', r'\u003c')
                    guide = guide.replace('<script id="collector-bundled-release" type="application/json">{}</script>',
                        '<script id="collector-bundled-release" type="application/json">' + bundled + '</script>')
                    guide = guide.replace('href="../../collector-release.json"', 'href="#bundled-release-details"')
                    (stage / file.name).write_text(guide, encoding='utf-8')
                else:
                    shutil.copy2(file, stage / file.name)
        shutil.copy2(ROOT / 'LICENSE', stage / 'LICENSE')
        shutil.copy2(ROOT / 'THIRD_PARTY_NOTICES.md', stage / 'THIRD_PARTY_NOTICES.md')
        source = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
        dirty = bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True).strip())
        files = [{'path': str(p.relative_to(stage)).replace('\\', '/'),
                  'sha256': digest(p), 'bytes': p.stat().st_size}
                 for p in sorted(stage.rglob('*')) if p.is_file()]
        manifest = {'schemaVersion': 1, 'id': release['id'], 'version': release['version'],
                    'channel': 'candidate', 'sourceCommit': source, 'sourceDirty': dirty,
                    'changes': release.get('changes', []),
                    'platform': 'win-x64', 'autoHotkey': runtime['autoHotkey'],
                    'visualCpp': runtime['visualCpp'], 'files': files,
                    'maximumDependencyBytes': sum(x['bytes'] for x in dependencies),
                    'coreDependencyBytes': sum(x['bytes'] for x in dependencies[:-1]),
                    'ocrExpandedBytes': ocr['expandedBytes'],
                    'windowsAcceptance': 'pending; native loading/UAC/game/novice checks are separate'}
        (stage / 'collector-package.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
        if full:
            (stage / 'components').mkdir()
            for item in dependencies:
                candidate = cache / item['filename']
                if not candidate.exists() and download:
                    cache.mkdir(parents=True, exist_ok=True)
                    print(f"Downloading {item['filename']} ({item['bytes']} bytes)", flush=True)
                    partial = candidate.with_suffix(candidate.suffix + '.partial')
                    with urllib.request.urlopen(item['url'], timeout=60) as response, partial.open('wb') as target:
                        shutil.copyfileobj(response, target)
                    partial.replace(candidate)
                if not candidate.exists():
                    raise ValueError(f"Missing fixed component: {candidate}; pass --download or --components")
                if candidate.stat().st_size != item['bytes'] or digest(candidate) != item['sha256']:
                    raise ValueError(f"Component size/SHA-256 mismatch: {candidate}")
                shutil.copy2(candidate, stage / 'components' / item['filename'])
        kind = 'full' if full else 'starter'
        archive = output / f"{release['id']}-{release['version']}-{kind}.zip"
        # Fixed metadata makes a rebuild of the same source/input bytes identical.
        with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
            for file in sorted(stage.rglob('*')):
                if file.is_file():
                    info = zipfile.ZipInfo(str(file.relative_to(stage)).replace('\\', '/'), (2026, 10, 28, 0, 0, 0))
                    info.compress_type = zipfile.ZIP_DEFLATED
                    info.external_attr = 0o100644 << 16
                    z.writestr(info, file.read_bytes())
        record = {'file': archive.name, 'bytes': archive.stat().st_size, 'sha256': digest(archive),
                  'sourceCommit': source, 'sourceDirty': dirty,
                  'maximumDependencyBytes': manifest['maximumDependencyBytes'],
                  'channel': 'candidate', 'windowsAcceptance': 'pending'}
        (output / (archive.name + '.json')).write_text(json.dumps(record, indent=2) + '\n')
        print(json.dumps(record))
        return archive


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--full', action='store_true')
    parser.add_argument('--components', type=Path)
    parser.add_argument('--download', action='store_true')
    args = parser.parse_args()
    try:
        build(args.output.resolve(), args.full, args.components, args.download)
    except (ValueError, OSError) as error:
        parser.exit(1, f'Candidate build failed: {error}\n')

"""Public maintenance CLI checks over explicit filesystem fixtures, not OCR readiness."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[2]
ENTRY = ROOT / 'public/collector/installer/manage-voyage-clip-collector-cn.ps1'


@unittest.skipUnless(os.environ.get('VOYAGE_PWSH'), 'isolated PowerShell supplied explicitly')
class MaintenanceTest(unittest.TestCase):
    def invoke(self, root, action, *args, input_text=None, entry=ENTRY):
        return subprocess.run([os.environ['VOYAGE_PWSH'], '-NoProfile', '-File', str(entry),
                               '-InstallRoot', str(root), '-Action', action, *args],
                              capture_output=True, text=True, input=input_text)

    def damaged_registration(self, root):
        release = root / 'releases/0.2.2-fixture'
        release.mkdir(parents=True)
        inventory = release / 'installed-files.json'
        inventory.write_text(json.dumps([{'path': 'missing-model.onnx', 'bytes': 10, 'sha256': 'a' * 64}]))
        current = {'schemaVersion': 1, 'id': 'voyage-clip-collector-cn', 'version': '0.2.2',
            'release': 'releases/0.2.2-fixture', 'package': 'packages/0.2.2-fixture',
            'inventory': {'bytes': inventory.stat().st_size,
                          'sha256': hashlib.sha256(inventory.read_bytes()).hexdigest()}}
        (root / 'current.json').write_text(json.dumps(current))
        return current

    def test_missing_model_still_exposes_version_and_repair_instructions(self):
        with tempfile.TemporaryDirectory(prefix="国服 O'Brien 维护 ") as tmp:
            root = Path(tmp)
            self.damaged_registration(root)
            result = self.invoke(root, 'Status')
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn('当前登记版本：0.2.2', result.stdout)
            self.assertIn('修复安装', result.stdout)
            self.assertIn('组件异常', result.stdout)
            self.assertNotIn('已就绪', result.stdout)

    def test_uninstall_refuses_a_registered_path_replaced_by_a_link_to_player_files(self):
        with tempfile.TemporaryDirectory(prefix='国服 链接保护 ') as tmp:
            base = Path(tmp)
            root = base / '应用'
            root.mkdir()
            current = self.damaged_registration(root)
            player = base / '玩家资料'
            player.mkdir()
            original = player / 'tool.bin'
            original.write_bytes(b'player data outside install root')
            release = root / 'releases/0.2.2-abcdef12'
            release.mkdir()
            (release / 'runtime').symlink_to(player, target_is_directory=True)
            ledger = {'schemaVersion': 1, 'id': current['id'], 'files': [
                {'path': 'releases/0.2.2-abcdef12/runtime/tool.bin', 'bytes': original.stat().st_size,
                 'sha256': hashlib.sha256(original.read_bytes()).hexdigest()}]}
            owned = root / 'owned-files.json'
            owned.write_text(json.dumps(ledger))
            current['ownership'] = {'bytes': owned.stat().st_size, 'sha256': hashlib.sha256(owned.read_bytes()).hexdigest()}
            (root / 'current.json').write_text(json.dumps(current))
            result = self.invoke(root, 'Uninstall', '-ConfirmUninstall')
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('拒绝跟随', result.stdout + result.stderr)
            self.assertEqual(original.read_bytes(), b'player data outside install root')
            self.assertTrue((root / 'current.json').exists())

    def test_interrupted_transaction_restores_stable_files_shortcuts_and_registration(self):
        with tempfile.TemporaryDirectory(prefix='国服 回退 ') as tmp:
            root = Path(tmp) / '应用'
            root.mkdir()
            old = self.damaged_registration(root)
            desktop = Path(tmp) / '桌面'
            desktop.mkdir()
            old['desktopRoot'] = str(desktop)
            old_current = json.dumps(old).encode()
            (root / 'current.json').write_bytes(old_current)
            directory = 'transactions/' + 'a' * 32
            backups = root / directory / 'backups'
            backups.mkdir(parents=True)
            originals = [
                ('install', 'collector-install.psm1', root / 'collector-install.psm1', b'old module'),
                ('install', 'launch-voyage-clip-collector-cn.ps1', root / 'launch-voyage-clip-collector-cn.ps1', b'old launcher'),
                ('desktop', '国服海图采集器.lnk', desktop / '国服海图采集器.lnk', b'old shortcut fixture'),
                ('install', 'previous.json', root / 'previous.json', b'previous binding fixture'),
                ('install', 'current.json', root / 'current.json', old_current),
            ]
            entries = []
            for i, (scope, name, target, content) in enumerate(originals):
                (backups / str(i)).write_bytes(content)
                new = ('interrupted new file ' + str(i)).encode()
                target.write_bytes(new)
                entries.append({'scope': scope, 'path': name, 'existed': True,
                    'backup': 'backups/' + str(i), 'backupSha256': hashlib.sha256(content).hexdigest(),
                    'backupBytes': len(content), 'newSha256': hashlib.sha256(new).hexdigest(),
                    'newBytes': len(new), 'attributes': 128})
            journal = {'schemaVersion': 1, 'id': 'voyage-clip-collector-cn', 'phase': 'applying',
                       'directory': directory, 'desktopRoot': str(desktop), 'entries': entries, 'createdFiles': []}
            (root / 'transaction.json').write_text(json.dumps(journal))
            sample = root / 'diagnostics/玩家截图.png'
            sample.parent.mkdir()
            sample.write_bytes(b'preserve user sample')
            result = self.invoke(root, 'Recover')
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            for _, _, target, content in originals:
                self.assertEqual(target.read_bytes(), content)
            self.assertEqual(sample.read_bytes(), b'preserve user sample')
            self.assertFalse((root / 'transaction.json').exists())
            self.assertNotIn('已就绪', result.stdout)

    def test_uninstall_removes_only_registered_bytes_and_preserves_player_material(self):
        with tempfile.TemporaryDirectory(prefix='国服 卸载 ') as tmp:
            root = Path(tmp) / '应用'
            root.mkdir()
            current = self.damaged_registration(root)
            managed = root / 'releases/0.2.2-abcdef12/runtime/tool.bin'
            managed.parent.mkdir(parents=True)
            managed.write_bytes(b'registered runtime fixture')
            player = managed.parent / '玩家截图.png'
            player.write_bytes(b'player screenshot')
            diagnostic = root / 'diagnostics/主动保存.txt'
            diagnostic.parent.mkdir()
            diagnostic.write_text('keep diagnosis')
            browser = Path(tmp) / '浏览器库存.json'
            browser.write_text('{"inventory":"preserve"}')
            desktop = Path(tmp) / '桌面'
            desktop.mkdir()
            shortcut = desktop / '国服海图采集器.lnk'
            shortcut.write_bytes(b'owned shortcut fixture')
            foreign = desktop / '国服海图采集器使用说明.lnk'
            foreign.write_bytes(b'changed user shortcut')
            ledger = {'schemaVersion': 1, 'id': 'voyage-clip-collector-cn', 'files': [
                {'path': str(managed.relative_to(root)), 'bytes': managed.stat().st_size,
                 'sha256': hashlib.sha256(managed.read_bytes()).hexdigest()}]}
            owned = root / 'owned-files.json'
            owned.write_text(json.dumps(ledger))
            current['ownership'] = {'bytes': owned.stat().st_size, 'sha256': hashlib.sha256(owned.read_bytes()).hexdigest()}
            current['desktopRoot'] = str(desktop)
            current['shortcuts'] = [
                {'name': shortcut.name, 'bytes': shortcut.stat().st_size,
                 'sha256': hashlib.sha256(shortcut.read_bytes()).hexdigest()},
                {'name': foreign.name, 'bytes': 10, 'sha256': 'a' * 64}]
            (root / 'current.json').write_text(json.dumps(current))
            result = self.invoke(root, 'Uninstall', '-ConfirmUninstall')
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertFalse(managed.exists())
            self.assertFalse(shortcut.exists())
            self.assertFalse((root / 'current.json').exists())
            self.assertEqual(player.read_bytes(), b'player screenshot')
            self.assertEqual(diagnostic.read_text(), 'keep diagnosis')
            self.assertEqual(browser.read_text(), '{"inventory":"preserve"}')
            self.assertEqual(foreign.read_bytes(), b'changed user shortcut')
            self.assertIn('保留', result.stdout)

    @unittest.skipUnless(os.environ.get('VOYAGE_COLLECTOR_COMPONENTS') and os.environ.get('VOYAGE_OLD_COLLECTOR_PACKAGE'),
                         'real old candidate and pinned archives supplied explicitly')
    def test_real_old_to_new_preparation_reuses_cache_and_bad_package_keeps_old_binding(self):
        with tempfile.TemporaryDirectory(prefix="国服 O'Brien 升级 ") as tmp:
            base = Path(tmp)
            root = base / '应用'
            old_source = root / 'packages/0.2.2-abcdef12'
            old_source.mkdir(parents=True)
            with zipfile.ZipFile(os.environ['VOYAGE_OLD_COLLECTOR_PACKAGE']) as z:
                z.extractall(old_source)
            old_identity = json.loads((old_source / 'payload/collector-release.json').read_text())
            self.assertEqual(old_identity['version'], '0.2.2')
            old_release = root / 'releases/0.2.2-abcdef12'
            shutil.copytree(old_source / 'payload', old_release)
            inventory = old_release / 'installed-files.json'
            inventory.write_text('[]')
            current = {'schemaVersion': 1, 'id': old_identity['id'], 'version': old_identity['version'],
                'release': 'releases/0.2.2-abcdef12', 'package': 'packages/0.2.2-abcdef12',
                'inventory': {'bytes': inventory.stat().st_size, 'sha256': hashlib.sha256(inventory.read_bytes()).hexdigest()}}
            binding = json.dumps(current).encode()
            (root / 'current.json').write_bytes(binding)
            old_script = (old_release / 'voyage-clip-collector-cn.ahk').read_bytes()
            shutil.copytree(os.environ['VOYAGE_COLLECTOR_COMPONENTS'], root / 'component-cache')
            times = {p.name: p.stat().st_mtime_ns for p in (root / 'component-cache').iterdir()}
            output = base / '新候选'
            subprocess.run([sys.executable, str(ROOT / 'scripts/build-collector.py'), '--output', str(output)],
                           check=True, capture_output=True, text=True)
            archive = next(output.glob('*-starter.zip'))
            frontdoor = output / '解压后的新候选'
            with zipfile.ZipFile(archive) as z:
                z.extractall(frontdoor)
            new_entry = frontdoor / 'manage-voyage-clip-collector-cn.ps1'
            result = self.invoke(root, 'Update', '-PackageArchive', str(archive), '-PrepareOnly', '-Offline', entry=new_entry)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn('当前 0.2.2 → 目标 0.2.4', result.stdout)
            self.assertIn('变化说明', result.stdout)
            self.assertEqual((root / 'current.json').read_bytes(), binding)
            cancelled = self.invoke(root, 'Update', '-PackageArchive', str(archive), input_text='\n', entry=new_entry)
            self.assertEqual(cancelled.returncode, 0, cancelled.stdout + cancelled.stderr)
            self.assertIn('已取消更新', cancelled.stdout)
            self.assertEqual((root / 'current.json').read_bytes(), binding)
            prepared_path = Path(next(line.removeprefix('PREPARED_PATH=') for line in result.stdout.splitlines()
                                      if line.startswith('PREPARED_PATH=')))
            new_source = root / 'packages/0.2.4-abcdef13'
            with zipfile.ZipFile(archive) as z:
                z.extractall(new_source)
            new_inventory = prepared_path / 'installed-files.json'
            current.update(version='0.2.4', release=str(prepared_path.relative_to(root)), package='packages/0.2.4-abcdef13',
                inventory={'bytes': new_inventory.stat().st_size,
                           'sha256': hashlib.sha256(new_inventory.read_bytes()).hexdigest()})
            current_bytes = json.dumps(current).encode()
            (root / 'current.json').write_bytes(current_bytes)
            model_relative = 'runtime/python/Lib/site-packages/rapidocr_onnxruntime/models/ch_PP-OCRv4_det_infer.onnx'
            missing = prepared_path / model_relative
            backup = base / '玩家验收备份.onnx'
            missing.rename(backup)
            repair = self.invoke(root, 'Repair', '-PrepareOnly', '-Offline', entry=new_entry)
            self.assertEqual(repair.returncode, 0, repair.stdout + repair.stderr)
            repaired_path = Path(next(line.removeprefix('PREPARED_PATH=') for line in repair.stdout.splitlines()
                                      if line.startswith('PREPARED_PATH=')))
            self.assertEqual(hashlib.sha256((repaired_path / model_relative).read_bytes()).hexdigest(),
                             'd2a7720d45a54257208b1e13e36a8479894cb74155a5efe29462512d42f49da9')
            self.assertEqual((root / 'current.json').read_bytes(), current_bytes)
            self.assertTrue(backup.exists())
            (new_source / 'payload/collector/border_ocr.py').write_bytes(b'corrupt fixed source')
            rejected = self.invoke(root, 'Repair', '-PrepareOnly', '-Offline', entry=new_entry)
            self.assertNotEqual(rejected.returncode, 0)
            self.assertIn('未执行该源', rejected.stdout + rejected.stderr)
            self.assertIn('重新取得完整候选', rejected.stdout + rejected.stderr)
            self.assertEqual((root / 'current.json').read_bytes(), current_bytes)
            self.assertEqual((old_release / 'voyage-clip-collector-cn.ahk').read_bytes(), old_script)
            self.assertEqual({p.name: p.stat().st_mtime_ns for p in (root / 'component-cache').iterdir()}, times)
            self.assertNotIn('[下载组件]', result.stdout)
            bad = base / '派生坏摘要候选.zip'
            with zipfile.ZipFile(archive) as original, zipfile.ZipFile(bad, 'w') as broken:
                for name in original.namelist():
                    content = original.read(name)
                    if name == 'payload/voyage-clip-collector-cn.ahk': content += b'corrupted'
                    broken.writestr(name, content)
            failed = self.invoke(root, 'Update', '-PackageArchive', str(bad), '-PrepareOnly', '-Offline', entry=new_entry)
            self.assertNotEqual(failed.returncode, 0)
            self.assertIn('校验', failed.stdout + failed.stderr)
            self.assertEqual((root / 'current.json').read_bytes(), current_bytes)


if __name__ == '__main__':
    unittest.main()

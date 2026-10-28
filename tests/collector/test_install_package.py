"""Public candidate builder/installer checks; native Windows results are separate."""
import hashlib
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[2]
BUILDER = ROOT / 'scripts/build-collector.py'


class InstallPackageTest(unittest.TestCase):
    def test_candidate_has_checked_payload_and_real_pinned_dependencies(self):
        with tempfile.TemporaryDirectory(prefix='国服 候选 ') as tmp:
            result = subprocess.run([sys.executable, str(BUILDER), '--output', tmp],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            archive = next(Path(tmp).glob('*-starter.zip'))
            first_digest = hashlib.sha256(archive.read_bytes()).hexdigest()
            subprocess.run([sys.executable, str(BUILDER), '--output', tmp], check=True,
                           capture_output=True, text=True)
            self.assertEqual(hashlib.sha256(archive.read_bytes()).hexdigest(), first_digest)
            with zipfile.ZipFile(archive) as z:
                manifest = json.loads(z.read('collector-package.json'))
                self.assertEqual(manifest['id'], 'voyage-clip-collector-cn')
                self.assertEqual(manifest['channel'], 'candidate')
                for entry in manifest['files']:
                    content = z.read(entry['path'])
                    self.assertEqual(hashlib.sha256(content).hexdigest(), entry['sha256'])
                guide = z.read('使用说明.html').decode('utf-8')
                bundled = re.search(r'<script id="collector-bundled-release" type="application/json">(.*?)</script>', guide, re.S)
                self.assertIsNotNone(bundled)
                self.assertEqual(json.loads(bundled.group(1)), json.loads(z.read('payload/collector-release.json')))
                self.assertIn('href="#bundled-release-details"', guide)
                self.assertIn('第一次安装', guide)
                self.assertIn('查看本地诊断', guide)
                self.assertIn('尚未公开发布', guide)
                self.assertIn('安装或更新国服海图采集器.cmd', z.namelist())
                self.assertIn('启动国服海图采集器.cmd', z.namelist())
                self.assertNotIn('runtime/python/python.exe', z.namelist())
                self.assertIn('payload/collector/border_ocr.py', z.namelist())
                for name in z.namelist():
                    if name.endswith(('.ps1', '.psm1')):
                        self.assertTrue(z.read(name).startswith(b'\xef\xbb\xbf'), name)
                    if name.endswith('.cmd'):
                        self.assertTrue(z.read(name).startswith(b'@echo off\r\nchcp 65001'), name)
                self.assertGreater(manifest['maximumDependencyBytes'], 120_000_000)
                self.assertEqual(manifest['autoHotkey']['version'], '2.0.31')
                self.assertEqual(manifest['visualCpp']['publisher'], 'Microsoft Corporation')

    @unittest.skipUnless(os.environ.get('VOYAGE_PWSH'), 'isolated PowerShell supplied explicitly')
    def test_installer_validates_candidate_and_rejects_corruption_without_registering_ready(self):
        with tempfile.TemporaryDirectory(prefix='国服 安装 ') as tmp:
            root = Path(tmp)
            result = subprocess.run([sys.executable, str(BUILDER), '--output', tmp],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            package = root / '解压 包'
            with zipfile.ZipFile(next(root.glob('*-starter.zip'))) as z:
                z.extractall(package)
            cmd = [os.environ['VOYAGE_PWSH'], '-NoProfile', '-File',
                   str(package / 'install-voyage-clip-collector-cn.ps1'),
                   '-PackageRoot', str(package), '-InstallRoot', str(root / '安装 目录'), '-ValidateOnly']
            valid = subprocess.run(cmd, capture_output=True, text=True)
            self.assertEqual(valid.returncode, 0, valid.stdout + valid.stderr)
            self.assertIn('包校验通过', valid.stdout)
            self.assertNotIn('安装完成', valid.stdout)
            self.assertFalse((root / '安装 目录/current.json').exists())

            (package / 'payload/voyage-clip-collector-cn.ahk').write_text('corrupted')
            invalid = subprocess.run(cmd, capture_output=True, text=True)
            self.assertNotEqual(invalid.returncode, 0)
            self.assertIn('校验', invalid.stdout + invalid.stderr)
            self.assertFalse((root / '安装 目录/current.json').exists())

    @unittest.skipUnless(os.environ.get('VOYAGE_PWSH'), 'isolated PowerShell supplied explicitly')
    def test_offline_missing_components_and_launch_without_installation_are_actionable(self):
        with tempfile.TemporaryDirectory(prefix="国服 O'Brien ") as tmp:
            root = Path(tmp)
            subprocess.run([sys.executable, str(BUILDER), '--output', tmp],
                           check=True, capture_output=True, text=True)
            package = root / '解压 包'
            with zipfile.ZipFile(next(root.glob('*-starter.zip'))) as z:
                z.extractall(package)
            prepare = subprocess.run([os.environ['VOYAGE_PWSH'], '-NoProfile', '-File',
                str(package / 'install-voyage-clip-collector-cn.ps1'), '-PackageRoot', str(package),
                '-InstallRoot', str(root / '应用 目录'), '-PrepareOnly', '-Offline'],
                capture_output=True, text=True)
            self.assertNotEqual(prepare.returncode, 0)
            self.assertIn('离线包缺少组件', prepare.stdout + prepare.stderr)
            self.assertFalse((root / '应用 目录/current.json').exists())
            launch = subprocess.run([os.environ['VOYAGE_PWSH'], '-NoProfile', '-File',
                str(package / 'launch-voyage-clip-collector-cn.ps1'),
                '-InstallRoot', str(root / '未安装 目录'), '-ValidateOnly'],
                capture_output=True, text=True)
            self.assertNotEqual(launch.returncode, 0)
            self.assertIn('尚未安装', launch.stdout + launch.stderr)
            self.assertNotIn('已就绪', launch.stdout)

    @unittest.skipUnless(os.environ.get('VOYAGE_PWSH') and os.environ.get('VOYAGE_COLLECTOR_COMPONENTS'),
                         'real pinned archives and isolated PowerShell supplied explicitly')
    def test_real_offline_candidate_prepares_all_models_without_claiming_windows_readiness(self):
        with tempfile.TemporaryDirectory(prefix="国服 O'Brien 离线 ") as tmp:
            root = Path(tmp)
            result = subprocess.run([sys.executable, str(BUILDER), '--output', tmp, '--full',
                                     '--components', os.environ['VOYAGE_COLLECTOR_COMPONENTS']],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            package = root / '中文 解压包'
            with zipfile.ZipFile(next(root.glob('*-full.zip'))) as z:
                z.extractall(package)
            cmd = [os.environ['VOYAGE_PWSH'], '-NoProfile', '-File',
                   str(package / 'install-voyage-clip-collector-cn.ps1'),
                   '-PackageRoot', str(package), '-InstallRoot', str(root / '应用 目录'),
                   '-PrepareOnly', '-Offline']
            prepared = subprocess.run(cmd, capture_output=True, text=True)
            self.assertEqual(prepared.returncode, 0, prepared.stdout + prepared.stderr)
            path = Path(next(line.removeprefix('PREPARED_PATH=') for line in prepared.stdout.splitlines()
                             if line.startswith('PREPARED_PATH=')))
            self.assertEqual((path / 'runtime/python/python.exe').read_bytes()[:2], b'MZ')
            self.assertEqual((path / 'runtime/ahk/AutoHotkey64.exe').read_bytes()[:2], b'MZ')
            model = path / 'runtime/python/Lib/site-packages/rapidocr_onnxruntime/models/ch_PP-OCRv4_det_infer.onnx'
            self.assertEqual(hashlib.sha256(model.read_bytes()).hexdigest(),
                             'd2a7720d45a54257208b1e13e36a8479894cb74155a5efe29462512d42f49da9')
            self.assertIn('Lib/site-packages', (path / 'runtime/python/python311._pth').read_text())
            self.assertTrue((path / 'collector/licenses/RapidOCR-LICENSE').exists())
            self.assertFalse((root / '应用 目录/current.json').exists())
            self.assertIn('尚未完成 Windows 自检', prepared.stdout)
            # Controlled registration fixture exercises file/path validation
            # only. It never claims installation, UAC, or native model success.
            installation = root / '应用 目录'
            inventory = path / 'installed-files.json'
            identity = json.loads((path / 'collector-release.json').read_text())
            registration = {'id': identity['id'], 'version': identity['version'],
                'release': str(path.relative_to(installation)),
                'package': 'packages/controlled-fixture',
                'inventory': {'bytes': inventory.stat().st_size,
                              'sha256': hashlib.sha256(inventory.read_bytes()).hexdigest()}}
            for name in ['collector-install.psm1', 'launch-voyage-clip-collector-cn.ps1']:
                shutil.copy2(package / name, installation / name)
            (installation / 'current.json').write_text(json.dumps(registration))
            check = [os.environ['VOYAGE_PWSH'], '-NoProfile', '-File',
                     str(installation / 'launch-voyage-clip-collector-cn.ps1'),
                     '-InstallRoot', str(installation), '-ValidateOnly']
            valid = subprocess.run(check, capture_output=True, text=True)
            self.assertEqual(valid.returncode, 0, valid.stdout + valid.stderr)
            self.assertIn('文件校验通过', valid.stdout)
            self.assertNotIn('已就绪', valid.stdout)
            model.unlink()
            damaged = subprocess.run(check, capture_output=True, text=True)
            self.assertNotEqual(damaged.returncode, 0)
            self.assertIn('校验失败或缺失', damaged.stdout + damaged.stderr)


if __name__ == '__main__':
    unittest.main()

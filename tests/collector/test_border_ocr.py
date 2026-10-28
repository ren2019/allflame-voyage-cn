"""Run with the pinned OCR environment; never downloads or reads the game."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
HELPER = ROOT / 'public/collector/border_ocr.py'


class BorderOcrCliTest(unittest.TestCase):
    def test_missing_image_preserves_stage_and_outputs_no_fake_success(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'result.txt'
            result = subprocess.run([sys.executable, str(HELPER), '--image',
                                     str(Path(directory) / 'missing.png'), '--output', str(output)],
                                    capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertTrue(output.exists())
            text = output.read_text(encoding='utf-8')
            self.assertEqual(text.count('OCR ERROR:'), 12)
            self.assertIn('图像读取', text)

    @unittest.skipUnless(os.environ.get('VOYAGE_OCR_IMAGE'), 'pinned OCR environment supplied explicitly')
    def test_model_integrity_error_stops_readiness(self):
        with tempfile.TemporaryDirectory() as directory:
            helper = Path(directory) / 'border_ocr.py'
            shutil.copyfile(HELPER, helper)
            lock = json.loads(HELPER.with_name('ocr-runtime.json').read_text())
            lock['models'][0]['sha256'] = '0' * 64
            helper.with_name('ocr-runtime.json').write_text(json.dumps(lock))
            result = subprocess.run([sys.executable, str(helper), '--self-test'],
                                    capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('组件自检失败', result.stderr)
            self.assertIn('模型缺失或校验失败', result.stderr)
            self.assertNotIn('"ready": true', result.stdout)

    @unittest.skipUnless(os.environ.get('VOYAGE_OCR_IMAGE'), 'original screenshot supplied explicitly')
    def test_real_screenshot_complete_text_and_twelve_positions(self):
        evidence = json.loads((ROOT / 'samples/border-ocr/issue-66/expected.json').read_text())
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'result.txt'
            diagnostics = Path(directory) / 'result.json'
            result = subprocess.run([sys.executable, str(HELPER), '--image', os.environ['VOYAGE_OCR_IMAGE'],
                                     '--output', str(output), '--diagnostics', str(diagnostics)],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            actual = json.loads(diagnostics.read_text())
            self.assertEqual(actual['sourceSha256'], evidence['sourceSha256'])
            self.assertEqual([x['text'].replace(' ', '') for x in actual['slots']],
                             [x['text'].replace(' ', '') for x in evidence['slots']])
            self.assertEqual([x['index'] for x in actual['slots']], list(range(12)))
            self.assertEqual(output.read_text().count('=== VOYAGE BORDER '), 12)


if __name__ == '__main__':
    unittest.main()

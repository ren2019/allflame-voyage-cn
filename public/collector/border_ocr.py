"""Offline Chinese border OCR. Reads a screenshot, never game input or clipboard.

Models come from the hash-locked RapidOCR wheel; startup never downloads them.
The output is the existing twelve-slot VOYAGE BORDER protocol, not mod matches.
"""
import argparse
import hashlib
from importlib import metadata
import json
from pathlib import Path
import re
import sys

ANCHORS = [(-.166, -.233), (-.025, -.232), (.134, -.231),
           (.212, -.137), (.211, -.004), (.219, .152),
           (-.177, .241), (-.022, .241), (.140, .243),
           (-.253, -.137), (-.255, -.001), (-.244, .137)]


def atomic_write(path, text):
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(text, encoding='utf-8')
    temporary.replace(path)


def payload(slots):
    return '\n'.join(f'=== VOYAGE BORDER {index} ===\n{text}\n=== END VOYAGE BORDER ==='
                     for index, text in enumerate(slots)) + '\n'


def load_engine():
    lock = json.loads(Path(__file__).with_name('ocr-runtime.json').read_text(encoding='utf-8'))
    if sys.version_info[:2] != (3, 11):
        raise RuntimeError('需要固定的 Python 3.11 运行组件；请从安装入口修复。')
    for package in lock['packages']:
        actual = metadata.version(package['name'])
        if actual != package['version']:
            raise RuntimeError(f"{package['name']} 版本为 {actual}，需要 {package['version']}；请修复安装。")
    import rapidocr_onnxruntime
    package_root = Path(rapidocr_onnxruntime.__file__).resolve().parent.parent
    for model in lock['models']:
        model_path = package_root / model['path']
        if not model_path.is_file() or hashlib.sha256(model_path.read_bytes()).hexdigest() != model['sha256']:
            raise RuntimeError(f"模型缺失或校验失败：{Path(model['path']).name}；请修复安装。")
    root = package_root / 'rapidocr_onnxruntime/models'
    engine = rapidocr_onnxruntime.RapidOCR(
        det_model_path=str(root / 'ch_PP-OCRv4_det_infer.onnx'),
        cls_model_path=str(root / 'ch_ppocr_mobile_v2.0_cls_infer.onnx'),
        rec_model_path=str(root / 'ch_PP-OCRv4_rec_infer.onnx'),
        intra_op_num_threads=lock['configuration']['intraOpThreads'],
        inter_op_num_threads=lock['configuration']['interOpThreads'])
    return engine, lock


def read_blocks(engine, image_path):
    import cv2
    import numpy as np
    # imdecode handles non-ASCII Windows paths, unlike some cv2.imread builds.
    image = cv2.imdecode(np.fromfile(str(image_path), dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise RuntimeError('图片无法解码；请保留原始 PNG 并重新截图。')
    blue, green, red = [image[:, :, i].astype(np.int16) for i in range(3)]
    # Preserve the original collector's lavender mask. This removes black
    # board text behind a tooltip without correcting or inventing any words.
    keep = (blue >= 130) & (blue - red >= 30) & (blue - green >= 30) & (abs(red - green) <= 18)
    prepared = np.full_like(image, 255)
    prepared[keep] = 0
    result, _ = engine(prepared)
    lines = []
    for box, text, confidence in result or []:
        xs, ys = zip(*box)
        lines.append({'text': text, 'x': min(xs), 'y': min(ys),
                      'right': max(xs), 'bottom': max(ys), 'confidence': float(confidence)})
    blocks = []
    for line in sorted(lines, key=lambda item: item['y']):
        for block in blocks:
            overlap = min(line['right'], block['right']) - max(line['x'], block['x'])
            height = max(12, line['bottom'] - line['y'])
            if 0 <= line['y'] - block['bottom'] <= height * .9 and overlap > 0:
                block['text'] += '\n' + line['text']
                block['x'] = min(block['x'], line['x'])
                block['right'] = max(block['right'], line['right'])
                block['bottom'] = max(block['bottom'], line['bottom'])
                block['confidence'] = min(block['confidence'], line['confidence'])
                break
        else:
            blocks.append(dict(line))
    # Gate complete tooltips after joining: wrapped continuation lines can
    # carry quantities/rewards without repeating any adjacency keyword.
    tooltips = [block for block in blocks
                if re.search(r'相邻|区域|航行|航程', re.sub(r'\s+', '', block['text']))]
    return tooltips, image.shape[1], image.shape[0]


def assign(points, blocks):
    # Retain the collector's greedy + pair-swap position assignment. It uses
    # geometry, never IDs or expected text. Missing positions remain errors.
    distances = [[((block['x'] + block['right']) / 2 - x) ** 2 +
                  ((block['y'] + block['bottom']) / 2 - y) ** 2 for block in blocks]
                 for x, y in points]
    assigned = [None] * len(points)
    used = set()
    candidates = sorted((distance, p, b) for p, row in enumerate(distances)
                        for b, distance in enumerate(row))
    for _, p, b in candidates:
        if assigned[p] is None and b not in used:
            assigned[p] = b
            used.add(b)
    for _ in range(50):
        changed = False
        for i in range(len(points)):
            for j in range(i + 1, len(points)):
                a, b = assigned[i], assigned[j]
                if a is None or b is None:
                    continue
                if distances[i][b] + distances[j][a] < distances[i][a] + distances[j][b]:
                    assigned[i], assigned[j] = b, a
                    changed = True
        if not changed:
            break
    return assigned


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--diagnostics', type=Path)
    parser.add_argument('--points', help='existing 12 x,y points, separated with semicolons')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    stage = '图像读取'
    try:
        if not args.self_test and (args.image is None or not args.image.is_file()):
            raise RuntimeError('未找到截图；请按住 Alt 显示十二条提示后重试。')
        stage = '组件自检'
        engine, lock = load_engine()
        if args.self_test:
            # Engine construction opens all three ONNX sessions and checks
            # their inputs/outputs. Readiness does not claim gameplay success.
            print(json.dumps({'ready': True, 'ocr': 'RapidOCR-ONNXRuntime 1.4.4',
                              'models': [Path(item['path']).name for item in lock['models']]}, ensure_ascii=False))
            return 0
        stage = '文字识别'
        blocks, width, height = read_blocks(engine, args.image)
        if not blocks:
            raise RuntimeError('没有读取到边界提示；按住 Alt 重试，或在网页手动补选。')
        stage = '位置分配'
        points = ([tuple(float(value) for value in pair.split(',')) for pair in args.points.split(';')]
                  if args.points else [(round(width / 2 + x * height), round(height / 2 + y * height))
                                       for x, y in ANCHORS])
        if len(points) != 12 or any(len(point) != 2 for point in points):
            raise RuntimeError('需要十二个有效边界坐标；请修复安装。')
        assigned = assign(points, blocks)
        slots = [blocks[b]['text'] if b is not None else
                 'OCR ERROR: 此位置未读取到边界提示，请重试或在网页手动选择。' for b in assigned]
        stage = '输出写入'
        if args.output is None:
            raise RuntimeError('缺少输出路径；请修复安装。')
        atomic_write(args.output, payload(slots))
        if args.diagnostics:
            atomic_write(args.diagnostics, json.dumps({
                'sourceSha256': hashlib.sha256(args.image.read_bytes()).hexdigest(),
                'width': width, 'height': height, 'stage': 'completed',
                'ocr': 'RapidOCR-ONNXRuntime 1.4.4',
                'slots': [{'index': i, 'text': text} for i, text in enumerate(slots)],
                'blocks': blocks,
            }, ensure_ascii=False, indent=2) + '\n')
        return 0
    except Exception as error:
        message = f'{stage}失败：{error}'
        if args.output:
            try:
                atomic_write(args.output, payload(['OCR ERROR: ' + message] * 12))
            except OSError:
                pass
        print(message, file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())

# #66 同图回放证据

原始 `screenshot-0006.png` 由用户于 2026-10-28 提供，2560×1440，S30 字样可见；具体客户端构建和显示缩放未知。原图含私人库存，保留在本机而不纳入源码；`expected.json` 记录原图 SHA-256、独立目视转写和十二槽位置。本轮主代理另行目视核对了预期。槽位顺序为顶部左到右、右侧上到下、底部左到右、左侧上到下。

- `windows-ocr.txt`：从原发布脚本提取的未经修改 Windows OCR helper，在现有 Windows x64（内核 10.0.26300.0）中用此 PNG 实际回放的原始输出。仅独立临时目录处理文件，未安装新版本、启动新采集器、改剪贴板或操作游戏。结果与先前 Issue 保存的原始输出一致；真实网页解析匹配 5/12，未匹配 7/12。
- `rapidocr.txt` / `rapidocr.json`：固定版本离线助手对**同一原图**的未经纠字输出与位置几何。Mac arm64 / CPython 3.11.15 隔离环境，RapidOCR-ONNXRuntime 1.4.4、ONNX Runtime 1.20.1、PaddleOCRv4 det/rec 与 mobile v2 cls；依赖版本与 `public/collector/ocr-runtime.json` 相同。原版蓝字遮罩去除背景文字，先聚合多行再筛选词缀提示；不替换字词、不据预期猜测数字或句子。
- 独立逐槽预期核对：12/12 完整文字、数字档位及位置正确，四处末尾“锚”均保留；真实 `parseBorderOcrPayload` 得到 12/12 ID 匹配。圣甲虫的“一个”通过精确客户端写法适配，原版“1 个”仍接受；“掉詹”、缺“锚”或改数字仍拒绝。

这是**一张真实截图的同图引擎回放通过**，不表示所有分辨率/HDR/显示模式已实测，也不表示 Windows 新运行时、安装、UAC、F7/F8 游戏操作或新手体验已验收。最初报告“失败八条”与保留原始输出“失败七条”的差异仍未知，不改写为同一结果。后续安装与人工现场在 #73–#77 记录。

开发回放入口（在隔离 Python 3.11 环境安装清单内版本，按本机平台安装对应依赖；Windows 哈希锁只适用于 Windows wheel）：

```sh
VOYAGE_OCR_IMAGE=/absolute/path/screenshot-0006.png /path/to/python3.11 -m unittest discover -s tests/collector -v
/path/to/python3.11 public/collector/border_ocr.py --image /absolute/path/screenshot-0006.png --output /tmp/borders.txt --diagnostics /tmp/borders.json
npm run test:border-ocr
```

无原图时，`npm run test:border-ocr` 仍会把两份已取得的原始引擎输出送入真实网页解析器，保留旧 5/7 与新 12/0 的断言。没有 `VOYAGE_OCR_IMAGE` 时 Python 的真实图像用例显式跳过，不能把跳过报告为再次识别成功。

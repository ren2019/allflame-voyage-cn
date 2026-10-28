# 国服离线 OCR 维护入口

这是 `voyage-clip-collector-cn` 候选组件，不是已公开发布的安装包。普通玩家安装和系统授权由安装入口处理；这里的命令仅供维护者回放或自检。

`border_ocr.py` 从 AHK 截图助手取得 PNG 与十二个坐标，输出现有 `VOYAGE BORDER` 协议。它不读取系统剪贴板、不向游戏发送输入、不联网、不自动下载模型，也不把读到文字称作网页匹配成功。错误输出包含失败阶段；缺失或损坏组件不会输出“已就绪”。英文/韩文保留原 Windows OCR，国服中文使用此助手。

安装布局由 #73 消费：

```text
voyage-clip-collector-cn.ahk
collector/border_ocr.py
collector/ocr-runtime.json
collector/licenses/RapidOCR-LICENSE
collector/licenses/PaddleOCR-LICENSE
runtime/python/python.exe
runtime/python/Lib/site-packages/...
```

`ocr-runtime.json` 固定 Python 3.11.9 Windows x64 embeddable archive、十九个完整传递依赖 wheel、三份中文 ONNX 模型，包含真实 URL、文件名、字节数及 SHA-256。Windows marker 依赖包括 `tqdm → colorama` 与 `humanfriendly → pyreadline3`；已用 Windows 平台解析及逐项依赖约束核对。`requirements-win-x64.lock` 的摘要只适用于指定 Windows wheel；离线安装器应直接校验/展开锁定文件，不再在线解析依赖。

所有 wheel 已在本机下载并核对摘要，模型摘要取自这份 RapidOCR wheel。模型内嵌中文字符表；初始化明确指定本地模型路径，缺模型即失败。安装应保留完整 wheel 的包、原生库和 dist-info 许可文件。`licenseFiles` 为实际 Windows wheel 内的许可路径；RapidOCR wheel 无 LICENSE，因此两份项目/模型许可随 `collector/licenses/` 单独提供，来源见 `additionalLicenses`。Python archive 自带 `LICENSE.txt`。不需要全局 Python、pip 或模型下载步骤。

启动自检：

```text
runtime\python\python.exe collector\border_ocr.py --self-test
```

它核对组件版本及模型摘要，建立全部三份 ONNX session 后才输出 `ready:true`。仅解压成功不足以判定就绪；Windows 原生库加载（含 VC++ 运行库）、权限、取消授权、实际安装路径和游戏体验由安装候选及 #77 核对。本票没有在用户 Windows 安装新运行时，清单不能被表述为这些步骤已验收。

同图证据及边界见源码 `samples/border-ocr/issue-66/README.md`。版本迭代须同步脚本、`collector-release.json`、兼容清单和国服更新记录。

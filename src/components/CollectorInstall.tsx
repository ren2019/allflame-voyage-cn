import { useEffect, useState } from 'react'
import './collector-install.css'

interface CollectorRelease {
  schemaVersion: 1
  id: 'voyage-clip-collector-cn'
  version: string
  script: 'voyage-clip-collector-cn.ahk'
  channel: 'candidate'
}
type ReleaseState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; release: CollectorRelease }
const guide = `${import.meta.env.BASE_URL}collector/installer/使用说明.html`
const manifest = `${import.meta.env.BASE_URL}collector-release.json`

function isCollectorRelease(value: unknown): value is CollectorRelease {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Partial<CollectorRelease>
  return entry.schemaVersion === 1 && entry.id === 'voyage-clip-collector-cn'
    && typeof entry.version === 'string' && /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(entry.version)
    && entry.script === 'voyage-clip-collector-cn.ahk' && entry.channel === 'candidate'
}

export function CollectorInstall() {
  const [state, setState] = useState<ReleaseState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let alive = true
    setState({ kind: 'loading' })
    fetch(manifest).then(async response => {
      if (!response.ok) throw new Error('Manifest unavailable')
      const release: unknown = await response.json()
      if (!isCollectorRelease(release)) throw new Error('Invalid collector manifest')
      if (alive) setState({ kind: 'ready', release })
    }).catch(() => {
      if (alive) setState({ kind: 'error' })
    })
    // This tiny public metadata request may finish after cleanup. Suppress stale
    // state updates without cancelling StrictMode's first request.
    return () => { alive = false }
  }, [attempt])

  return <section className="collector-install-card" aria-label="国服采集器安装">
    <h3>国服海图采集器 <span className="collector-candidate">候选未公开发布</span></h3>
    <p>Windows 本地辅助工具；首次安装需要取得组件，准备后可离线识别。不会向游戏发送按键或点击，不上传图片或剪贴板。</p>
    <div className="collector-entry-actions">
      <a className="collector-install-primary" href={`${guide}#install`} target="_blank" rel="noopener noreferrer">安装国服海图采集器</a>
      <a href={guide} target="_blank" rel="noopener noreferrer">安装与使用说明</a>
    </div>
    <p className="collector-release-status" aria-live="polite">
      {state.kind === 'loading' && '正在读取候选版本…'}
      {state.kind === 'error' && '暂时无法读取候选版本；安装与使用说明仍可打开，请稍后重试。'}
      {state.kind === 'ready' && `候选版本 v${state.release.version} · 目标 Windows x64，真实 Windows 与游戏体验待玩家验收。`}
    </p>
    {state.kind === 'error' && <button type="button" onClick={() => setAttempt(value => value + 1)}>重试读取候选版本</button>}
    <p className="collector-delivery">候选 ZIP 随本轮验收材料提供，当前没有公开下载或镜像。小启动包不到 0.1 MiB；后续组件最多约 120 MiB，完整离线包约 119 MiB。空间与验收范围见说明。</p>
    <ol>
      <li>安装包“全部解压”，双击“安装或更新国服海图采集器.cmd”。</li>
      <li>完成后双击桌面“国服海图采集器”，确认正常管理员授权，等待浮窗“已就绪”。</li>
      <li>F7 后逐张手动 Ctrl+Alt+C 采海图；边界可单独按住 Alt 后 F8，看到截图完成再松开，等待读取后导入网页。未匹配可手动选择。</li>
    </ol>
    <details className="collector-advanced">
      <summary>高级维护：裸脚本与版本清单</summary>
      <p>裸脚本需要 AutoHotkey v2、管理员运行及同版本完整组件；普通玩家使用上面的安装入口。边界使用本机 RapidOCR 简体中文 OCR；F7/F8 的浮窗会显示进度与具体错误。</p>
      <p><a href={manifest} target="_blank" rel="noopener noreferrer">查看候选版本清单</a></p>
      {state.kind === 'ready' && <>
        <a className="ahk-dl" href={`${import.meta.env.BASE_URL}${state.release.script}`} download>⬇ 下载国服 {state.release.script}</a>
        <p>脚本版本 v{state.release.version}；可在浮窗、托盘“版本与运行信息”核对版本和权限。</p>
      </>}
    </details>
  </section>
}

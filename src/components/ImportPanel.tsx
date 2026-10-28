import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { ALL_GOOD_MODS_REGEX, RARE_IMPLICITS } from '../data/strategies'
import { parseBorderOcrPayload } from '../logic/borderOcr'
import { isChartClipboardText, parseChartText } from '../logic/parser'
import { dedupeNewCharts, type ImportHit } from '../logic/importDedupe'
import type { AppState } from '../logic/storage'
import { defaultState } from '../logic/storage'
import type { ChartData } from '../types'
import { CompactCopyText } from './CompactCopyText'

interface Props {
  onFeedback?: (hits: ImportHit[]) => void
  onImport: (charts: ChartData[]) => void
  state: AppState
  onLoadState: Dispatch<SetStateAction<AppState>>
}

export function ImportPanel({ onImport, onFeedback, state, onLoadState }: Props) {
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')
  const successfulImports = useRef(0)
  // celebratory alert when an import brings in rare-implicit (Divine fuel) charts
  const [rareAlert, setRareAlert] = useState('')

  const doParse = useCallback((raw?: string) => {
    const source = raw ?? text
    const borderOcr = parseBorderOcrPayload(source)
    const { charts, rejected } = parseChartText(borderOcr.chartText)
    const notCharted = rejected.filter((r) => r.reason.startsWith('not charted'))
    if (charts.length === 0 && rejected.length === 0 && borderOcr.blockCount === 0) {
      setMsg('未识别到物品，请粘贴国服 Ctrl+Alt+C 高级复制文本。')
      return
    }

    // Re-pasting charts that are already in the library created phantom
    // duplicates the solver then placed as "the same chart twice" (issue #46)
    const { fresh, skipped, hits } = dedupeNewCharts(state.pool, charts)

    if (borderOcr.blockCount > 0) {
      // A complete importer sweep is a snapshot of all 12 current rolls.
      // Start clean so an OCR miss cannot leave a stale modifier from an
      // earlier run and masquerade as a wrongly recognized border - but an
      // ALL-miss sweep (bad aim, tooltips not visible) must never wipe
      // borders the user already entered.
      onLoadState((current) => {
        const fullSweep = borderOcr.blockCount >= 12 && borderOcr.matches.length > 0
        const borders = fullSweep ? [...borderOcr.borders] : [...current.borders]
        for (const match of borderOcr.matches) borders[match.index] = match.id
        return {
          ...current,
          pool: fresh.length > 0 ? [...current.pool, ...fresh] : current.pool,
          borders,
        }
      })
    } else if (fresh.length > 0) {
      onImport(fresh)
    }
    if (hits.length) onFeedback?.(hits)
    if (charts.length > 0 || borderOcr.blockCount > 0) {
      setText('')
    }

    const parts: string[] = []
    if (fresh.length) {
      const wording = ['已导入', '已加入库存', '已收录'][successfulImports.current % 3]
      successfulImports.current += 1
      const names = fresh.slice(0, 2).map(chart => chart.name).join('、')
      const summary = fresh.length > 2 ? `${names} 等 ${fresh.length} 张` : names
      parts.push(`${wording} ${fresh.length} 张海图：${summary}`)
    }
    if (skipped)
      parts.push(
        `跳过 ${skipped} 张已在库存中的海图`
          + '（重新导入前可先清空库存）',
      )
    // distinct physical charts always differ in their rolled values, so a big
    // batch of byte-identical imports means the same item text was repeated
    // (issue #20)
    if (charts.length >= 5) {
      const key = (c: ChartData) =>
        JSON.stringify([c.name, c.level, c.modIds, c.implicitText, c.rewards, c.shape, c.rawText])
      const first = key(charts[0])
      if (charts.every((c) => key(c) === first))
        parts.push(
          `⚠ ${charts.length} 张海图的属性完全相同，可能重复粘贴了同一份文本`,
        )
    }
    if (borderOcr.blockCount > 0) {
      parts.push(
        `已匹配 ${borderOcr.matches.length}/${borderOcr.blockCount} 个边界词缀`,
      )
    }
    if (notCharted.length)
      parts.push(`拒绝 ${notCharted.length} 张未测绘海图（先完成测绘以揭示航行词缀）`)
    const otherRejects = rejected.length - notCharted.length
    if (otherRejects > 0) parts.push(`拒绝 ${otherRejects} 项无法识别`)
    if (borderOcr.blockCount > 0 && borderOcr.matches.length === 0) {
      parts.push(
        '未识别边界悬停文本，已保留原有边界',
      )
    } else if (borderOcr.misses.length > 0) {
      parts.push(`OCR 未匹配的边界位置：${borderOcr.misses
        .map((miss) => miss.index + 1)
        .join(', ')}`)
    }
    setMsg(parts.join('; ') || '本次未导入海图')

    // rare-implicit charts are the Divine strategies' fuel - flag them loudly
    // so a jackpot piece never slips into the library unnoticed (only newly
    // imported ones celebrate - re-scans are old news)
    const rares = fresh.filter((c) =>
      c.modIds.some((id) => (RARE_IMPLICITS as readonly string[]).includes(id)),
    ).length
    setRareAlert(
      rares > 0
        ? `已导入 ${rares} 张稀有怪物海图，可用于神圣石策略。已在库存中锁定 🔒，保留给神圣石边界摆盘。`
        : '',
    )
  }, [onImport, onFeedback, onLoadState, state.pool, text])

  // Ctrl+V anywhere on the page: if the clipboard holds chart item text, import
  // it straight away (no need to focus the box). Normal pastes into fields are
  // untouched because only chart-shaped text is intercepted.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const clip = e.clipboardData?.getData('text') ?? ''
      if (!isChartClipboardText(clip) && !/===\s*VOYAGE BORDER/i.test(clip)) return
      e.preventDefault()
      doParse(clip)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [doParse])

  const clearAll = () => {
    if (window.confirm('清空全部海图、摆盘和边界？')) onLoadState(defaultState())
  }

  return (
    <div className="import-panel">
      <div className="panel-title">导入海图</div>
      <textarea
        rows={3}
        placeholder={
          '在国服游戏中 Ctrl+Alt+C 高级复制已测绘海图，再在本页 Ctrl+V 导入；也可粘贴到此处后解析。名称、区域等级、奖励、航行词缀和形状会一并读取。'
        }
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="import-actions">
        <button onClick={() => doParse()} disabled={!text.trim()}>
          解析并加入
        </button>
        <button onClick={clearAll} title="清空全部海图、摆盘和边界">
          重置
        </button>
      </div>
      <div className="import-result muted pad" role="status" aria-live="polite" aria-atomic="true">{msg}</div>
      {rareAlert && (
        <div className="import-rare-alert">
          <span>🎰 {rareAlert}</span>
          <button className="announce-close" title="关闭" onClick={() => setRareAlert('')}>
            ✕
          </button>
        </div>
      )}

      <details className="import-reference">
        <summary>导入说明与搜索参考</summary>
        <details className="ahk-help">
          <summary>🎲 洗练与保留海图（搜索参考）</summary>
          <p className="muted">
            海图完成测绘后无法洗练，应先洗练再运行；物品数量会影响保险箱奖励。
            优质词缀搜索使用已复核的 PoEDB 简中候选模板，游戏内匹配效果仍需现场验证。
            其余表达式保留原版英文参考。
          </p>
          <CompactCopyText label="优质词缀（简中候选）" text={ALL_GOOD_MODS_REGEX} />
          <CompactCopyText label="数量 120% 以上（英文参考）" text={'"m q.*(1[2-9].|[2-9]..)%"'} />
          <CompactCopyText label="硫磺 75% 以上（污秽蟹群，英文参考）" text={'"sul.*(7[5-9]|[89].|\\d..)%"'} />
        </details>

        <details className="ahk-help">
          <summary>📋 原版英文海图及边界采集器（Windows 参考）</summary>
          <p className="muted">
            原版可选辅助脚本<strong>不会向游戏发送按键或点击</strong>。所有按键由玩家自己操作；
            脚本读取主动复制的剪贴板内容，以及玩家按住 Alt 时的截图。
            原版 OCR 在 Windows 本地运行。此脚本和边界 OCR 未做国服适配。
          </p>
          <a
            className="ahk-dl"
            href={`${import.meta.env.BASE_URL}voyage-clip-collector.ahk`}
            download
          >
            ⬇ 下载原版 voyage-clip-collector.ahk
          </a>
          <ol className="ahk-steps">
            <li>
              安装{' '}
              <a href="https://www.autohotkey.com/" target="_blank" rel="noopener noreferrer">
                AutoHotkey v2
              </a>{' '}
              后运行脚本（在系统托盘中）。
            </li>
            <li>
              按 <kbd>F7</kbd> 开启复制模式，屏幕显示计数器。
            </li>
            <li>
              在原版支持的客户端中，逐张悬停海图并自行按 <kbd>Ctrl+C</kbd>，计数器增加。
              非海图和误操作的重复复制会被忽略。
            </li>
            <li>
              原版边界采集：<strong>按住 Alt</strong> 显示全部 12 个边界悬停提示，按{' '}
              <kbd>F8</kbd>，听到提示音后松开；文本在本地读取并加入批次。
            </li>
            <li>
              再次按 <kbd>F7</kbd>，切回本页并按 <kbd>Ctrl+V</kbd>，一次导入海图与边界；
              已在库存中的海图会跳过。
            </li>
          </ol>
          <p className="muted small">
            <kbd>Shift+F7</kbd> 可关闭提示音，屏幕计数器继续工作。
            游戏与原版采集器需要相同的权限级别才能响应快捷键。
          </p>
        </details>
        <p className="muted small">
          旧版批量操作脚本保持停用。上方保留原版英文采集器参考，国服流程使用手动复制与粘贴。
        </p>
      </details>
      <p className="muted small">
        问题或建议？{' '}
        <a
          href="https://github.com/ren2019/allflame-voyage-cn/issues"
          target="_blank"
          rel="noopener noreferrer"
        >
          提交 GitHub Issue
        </a>{' '}
        欢迎反馈或提交改进。
      </p>
    </div>
  )
}

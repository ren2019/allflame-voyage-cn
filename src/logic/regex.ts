// Build a compact search string for the in-game chart inventory search box
// ("Type keywords here..."), to highlight exactly the charts a solved board
// uses. Uses shortest-unique-substring per chart name (poe.re style) so the
// string stays short.
// LAUNCH-DAY TODO: confirm what fields the in-game search matches (name, mod
// text, level?) and whether it supports regex alternation `|` - adjust here.

import { VOYAGE_MODS, voyageModById } from '../data/mods'
import { voyageRewardKey } from './rewards'
import type { ChartData, VoyageModDef, Weights } from '../types'
import { TEXT_LIBRARY, mainlandDisplayText } from '../data/textLibrary'

const HANGUL_RE = /[\uac00-\ud7a3]/
const HAN_RE = /\p{Script=Han}/u
const mainlandImplicits = new Map(TEXT_LIBRARY.records
  .filter((record) => record.kind === 'chart-implicit' && record.cnText && ['confirmed', 'source-only'].includes(record.status))
  .map((record) => [record.internalId, mainlandDisplayText(record.cnText!)]))

/**
 * Build the search text used to find one exact chart in the in-game inventory.
 * Imported Korean charts keep Hangul in their verbatim item-derived fields, so
 * the level term can follow the client language without a separate UI locale.
 */
export function buildSingleChartSearch(chart: ChartData): string {
  const sourceText = [chart.implicitText, chart.rawText, chart.name].filter(Boolean).join('\n')
  const chinese = !HANGUL_RE.test(sourceText) && HAN_RE.test(sourceText)
  const implicit =
    chart.implicitText ??
    chart.modIds
      .map((id) => voyageModById.get(id))
      .filter((mod) => mod && mod.scope !== 'self')
      .map((mod) => chinese ? mainlandImplicits.get(mod!.id) ?? mod!.text : mod!.text)[0] ??
    ''
  const level = `${HANGUL_RE.test(sourceText) ? '지역 레벨' : chinese ? '区域等级' : 'Level'} ${chart.level}`
  return [chart.name, mainlandDisplayText(implicit), level].filter(Boolean).join(' ')
}

/**
 * Build a paste-into-game regex that highlights the BEST charts given the
 * user's reward weights - no import needed. Mods are ranked by weighted value
 * times scope reach (a global mod touches 9 areas, adjacent ~3, self 1), then
 * greedily added as shortest-unique text fragments until the length cap.
 * Fragments use letters/spaces only so rolled numeric values don't break them.
 */
export function buildBestModRegex(
  weights: Weights,
  cap = 50,
  disabledMods?: Set<string>,
  locale: 'en' | 'zh-CN' = 'en',
): { regex: string; included: VoyageModDef[] } {
  const reach = { self: 1, adjacent: 3, global: 9 } as const
  const lettersOnly = (s: string) =>
    s.toLowerCase().replace(locale === 'zh-CN' ? /[^\p{Script=Han} ]+/gu : /[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim()

  // group tier variants into families (identical text once numbers are stripped);
  // a family's value is its best tier's value
  const families = new Map<string, { m: VoyageModDef; v: number }>()
  for (const m of VOYAGE_MODS) {
    if (disabledMods?.has(m.id)) continue
    const w = weights[voyageRewardKey(m)] ?? 0
    const v = m.effects.reduce((s, e) => s + w * e.percent, 0) * reach[m.scope]
    if (v <= 0) continue
    // Source-conflicted self-reward templates are not client search evidence.
    const text = locale === 'zh-CN' ? mainlandImplicits.get(m.id) : m.text
    if (!text) continue
    const key = lettersOnly(text)
    const existing = families.get(key)
    if (!existing || v > existing.v) families.set(key, { m, v })
  }
  const scored = [...families.entries()]
    .map(([key, { m, v }]) => ({ key, m, v }))
    .sort((a, b) => b.v - a.v)

  const token = (key: string, otherKeys: string[]): string => {
    for (let len = 3; len <= key.length; len++) {
      for (let i = 0; i + len <= key.length; i++) {
        const sub = key.slice(i, i + len)
        if (sub !== sub.trim()) continue
        if (!otherKeys.some((t) => t.includes(sub))) return sub
      }
    }
    return key
  }

  const included: VoyageModDef[] = []
  const tokens: string[] = []
  for (const { key, m } of scored) {
    const otherKeys = [...families.keys()].filter((k) => k !== key)
    const t = token(key, otherKeys)
    const candidate = [...tokens, t].join('|')
    if (candidate.length > cap) {
      if (tokens.length === 0) continue // skip an oversized top family, try the next
      break
    }
    tokens.push(t)
    included.push(m)
  }
  return { regex: tokens.join('|'), included }
}

export function buildChartSearch(targets: string[], otherPoolNames: string[]): string {
  const targetSet = new Set(targets.map((t) => t.toLowerCase()))
  const others = otherPoolNames.map((s) => s.toLowerCase()).filter((o) => !targetSet.has(o))

  const parts: string[] = []
  for (const name of targetSet) {
    let best: string | null = null
    for (let len = 3; len <= name.length && !best; len++) {
      for (let i = 0; i + len <= name.length; i++) {
        const sub = name.slice(i, i + len)
        if (sub !== sub.trim()) continue
        if (!others.some((o) => o.includes(sub))) {
          best = sub
          break
        }
      }
    }
    parts.push(best ?? name)
  }
  return [...new Set(parts)].join('|')
}

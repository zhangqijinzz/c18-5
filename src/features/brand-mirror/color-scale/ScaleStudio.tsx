import { useMemo, useState } from 'react'
import { contrastRatio, recommendInk, SCALE_STOPS } from '../color-scale/scaleGenerator'
import type { BrandMirrorSnapshot, TokenSection } from '../models/brandMirrorModels'

interface ScaleStudioProps {
  snapshot: BrandMirrorSnapshot
  onGenerate: (seed: string) => void
  onToggleSection: (section: TokenSection) => void
  onApply: () => void
  onDiscard: () => void
  onRevert: () => void
}

type Rating = 'AAA' | 'AA' | 'AALarge' | 'Fail'

function ratingOf(ratio: number): Rating {
  if (ratio >= 7) return 'AAA'
  if (ratio >= 4.5) return 'AA'
  if (ratio >= 3) return 'AALarge'
  return 'Fail'
}

const sectionOptions: { key: TokenSection; label: string; detail: string }[] = [
  { key: 'primaryScale', label: '整条梯度', detail: 'primary-50 → 900' },
  { key: 'primary', label: '主色 primary', detail: '同步为 500' },
  { key: 'secondary', label: '辅助色 secondary', detail: '使用 900 深色' },
]

export function ScaleStudio({ snapshot, onGenerate, onToggleSection, onApply, onDiscard, onRevert }: ScaleStudioProps) {
  const [seed, setSeed] = useState(snapshot.tokens.primary)
  const pending = snapshot.pendingScale
  const applied = snapshot.lastAppliedScale

  const preview = useMemo(() => {
    const scale = pending?.scale ?? snapshot.tokens.primaryScale ?? []
    const darkInk = snapshot.tokens.secondary
    return scale.map((hex, index) => {
      const light = contrastRatio(hex, '#FFFFFF')
      const dark = contrastRatio(hex, darkInk)
      const best = Math.max(light, dark)
      return {
        hex,
        stop: SCALE_STOPS[index],
        onInk: recommendInk(hex, darkInk),
        best: Math.round(best * 10) / 10,
        rating: ratingOf(best),
      }
    })
  }, [pending, snapshot.tokens.primaryScale, snapshot.tokens.secondary])
  const failing = preview.filter((step) => step.rating === 'Fail' || step.rating === 'AALarge')
  const draft = !!pending

  return (
    <section className="control-section scale-studio">
      <div className="section-label"><span>品牌色梯度</span><span className="muted">种子色 → 10 级</span></div>

      <div className="scale-seed-row">
        <div className="color-input">
          <input aria-label="梯度种子色" type="color" value={/^#[0-9A-F]{6}$/i.test(seed) ? seed : snapshot.tokens.primary} onChange={(event) => setSeed(event.target.value)} />
          <input aria-label="梯度种子色 HEX" value={seed} onChange={(event) => setSeed(event.target.value)} />
        </div>
        <button className="generate-button" type="button" onClick={() => onGenerate(seed)}>生成梯度</button>
      </div>
      <p className="scale-hint">以种子色为 500 锚点向深浅展开，生成时即约束文字与底色对比度 ≥ 4.5:1（正文）。</p>

      {preview.length > 0 && (
        <div className={`scale-ramp ${draft ? 'is-draft' : ''}`}>
          {preview.map((step) => (
            <div className="ramp-step" key={step.stop} style={{ background: step.hex }} title={`${step.stop} · ${step.hex} · 最佳文字对比 ${step.best}:1`}>
              <span className="ramp-ink" style={{ color: step.onInk }}>Aa</span>
              <span className="ramp-meta" style={{ color: step.onInk }}>
                <b>{step.stop}</b>
                <i className={step.rating === 'Fail' ? 'rating-fail' : step.rating === 'AALarge' ? 'rating-large' : ''}>{step.rating === 'AALarge' ? '3:1' : step.rating === 'Fail' ? '—' : `${step.best}`}</i>
              </span>
            </div>
          ))}
        </div>
      )}

      {draft && pending && (
        <>
          <div className="scale-report">
            {pending.anchorAdjusted
              ? <span className="report-warn">500 已微调至 {pending.anchorHex}：种子色对两种墨色均低于大字号对比</span>
              : pending.anchorBodyPasses
                ? <span className="report-ok">500 锚点保持种子色 {pending.seed}，压字达到正文对比</span>
                : <span className="report-warn">500 保持 {pending.seed}，仅建议大字号 / 图形；正文压字请改用 600 或 400</span>}
            {failing.length > 0
              ? <span className="report-warn">{failing.map((step) => step.stop).join(' / ')} 级对比偏低，建议用于大字号或图形</span>
              : <span className="report-ok">其余 9 级与其文字色均达到正文 4.5:1</span>}
          </div>

          <div className="section-label keep-label"><span>应用范围</span><span className="muted">未勾选将保留现有值</span></div>
          <div className="keep-list">
            {sectionOptions.map((option) => (
              <label key={option.key} className={`keep-option ${pending.sections[option.key] ? 'checked' : ''}`}>
                <input type="checkbox" checked={pending.sections[option.key]} onChange={() => onToggleSection(option.key)} />
                <span><strong>{option.label}</strong><small>{option.detail}</small></span>
              </label>
            ))}
          </div>

          <div className="scale-actions">
            <button className="apply-button" type="button" onClick={onApply}>应用到工作区</button>
            <button className="discard-button" type="button" onClick={onDiscard}>放弃</button>
          </div>
        </>
      )}

      {!draft && applied && (
        <div className="revert-bar">
          <span>已应用 <strong>{applied.seed}</strong> 梯度</span>
          <button type="button" onClick={onRevert}>↩ 退回生成前</button>
        </div>
      )}
    </section>
  )
}

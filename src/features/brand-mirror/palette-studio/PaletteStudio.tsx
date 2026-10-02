import { useState } from 'react'
import type { BrandMirrorSnapshot, PaletteApplyTargets } from '../models/brandMirrorModels'

interface PaletteStudioProps {
  snapshot: BrandMirrorSnapshot
  onGenerate: (seed: string, surface: string) => void
  onDiscard: () => void
  onApply: (targets: PaletteApplyTargets) => void
  onRevert: () => void
}

const LIGHT_SURFACE = '#FFFFFF'
const DARK_SURFACE = '#191829'

export function PaletteStudio({ snapshot, onGenerate, onDiscard, onApply, onRevert }: PaletteStudioProps) {
  const [seed, setSeed] = useState(snapshot.tokens.primary)
  const [surface, setSurface] = useState(LIGHT_SURFACE)
  const [replacePrimary, setReplacePrimary] = useState(true)
  const [replaceSecondary, setReplaceSecondary] = useState(false)
  const draft = snapshot.paletteDraft

  return (
    <section className="palette-section control-section">
      <div className="section-label"><span>主色梯度生成</span><span className="muted">50–900 / 10 档</span></div>

      {snapshot.checkpoint && !draft && (
        <div className="checkpoint-banner">
          <span className="checkpoint-icon">↺</span>
          <div>
            <strong>{snapshot.checkpoint.label}</strong>
            <small>{new Date(snapshot.checkpoint.createdAt).toLocaleString('zh-CN', { hour12: false })}</small>
          </div>
          <button type="button" className="checkpoint-revert" onClick={onRevert}>退回</button>
        </div>
      )}

      <label className="color-field palette-seed">
        <span>种子色</span>
        <div className="color-input">
          <input aria-label="种子色" type="color" value={seed} onChange={(event) => setSeed(event.target.value)} />
          <input aria-label="种子色 HEX" value={seed} onChange={(event) => setSeed(event.target.value)} />
        </div>
      </label>

      <div className="surface-toggle" role="radiogroup" aria-label="生成时约束的底色">
        <span>底色约束</span>
        <button type="button" role="radio" aria-checked={surface === LIGHT_SURFACE} className={surface === LIGHT_SURFACE ? 'active' : ''} onClick={() => setSurface(LIGHT_SURFACE)}>浅底</button>
        <button type="button" role="radio" aria-checked={surface === DARK_SURFACE} className={surface === DARK_SURFACE ? 'active' : ''} onClick={() => setSurface(DARK_SURFACE)}>深底</button>
      </div>
      <p className="palette-rule-hint">生成时逐档保证：浅色档配深字、深色档配白字，正文对比 ≥ 4.5:1，实色与底色 ≥ 3:1。</p>
      <button type="button" className="palette-generate" onClick={() => onGenerate(seed, surface)}>✦ 从种子色生成梯度</button>

      {draft && (
        <div className="palette-draft">
          <div className={`draft-summary ${draft.failingTextSteps.length > 0 ? 'has-warning' : ''}`}>
            <strong>{draft.failingTextSteps.length === 0 ? '全部档位文字可读' : '部分档位文字需注意'}</strong>
            <span>
              {draft.failingTextSteps.length > 0 && `种子所在的 ${draft.failingTextSteps.join(' / ')} 档未达正文 4.5:1，仅建议放大字或粗体；`}
              {draft.failingSurfaceSteps.length > 0 && `${draft.failingSurfaceSteps.join(' / ')} 档与当前底色对比不足，不建议作为该底色上的实色（可作浅色块 / 装饰色）；`}
              {draft.failingTextSteps.length === 0 && draft.failingSurfaceSteps.length === 0 && '文字与底色可读性约束全部通过。'}
            </span>
          </div>

          <div className="ramp-grid">
            {draft.stops.map((stop) => (
              <div className="ramp-stop" key={stop.step} style={{ background: stop.color, color: stop.onColor }} title={`${stop.step} · ${stop.color} · 文字对比 ${stop.textContrast.toFixed(1)}:1`}>
                <b>{stop.step}</b>
                <code>{stop.color}</code>
                <i className={stop.textLevel === 'AA' ? 'level-aa' : stop.textLevel === 'AA_LARGE' ? 'level-large' : 'level-fail'}>{stop.textLevel === 'AA' ? 'AA' : stop.textLevel === 'AA_LARGE' ? '大字' : '✕'}</i>
              </div>
            ))}
          </div>

          <div className="apply-targets">
            <span className="apply-targets-title">应用范围</span>
            <label className="apply-check">
              <input type="checkbox" checked={replacePrimary} onChange={(event) => setReplacePrimary(event.target.checked)} />
              <span>同步主色 <code>primary</code> = 种子色 <b>{draft.seed}</b></span>
            </label>
            <label className="apply-check">
              <input type="checkbox" checked={replaceSecondary} onChange={(event) => setReplaceSecondary(event.target.checked)} />
              <span>同步辅助色 <code>secondary</code> = 900 档 <b>{draft.stops[draft.stops.length - 1].color}</b></span>
            </label>
            <p className="apply-preserve-note">圆角 / 间距 / 字体比例与未勾选的颜色会原样保留；应用后可在上方一键退回。</p>
          </div>

          <div className="draft-actions">
            <button type="button" className="draft-discard" onClick={onDiscard}>放弃</button>
            <button type="button" className="draft-apply" onClick={() => onApply({ replacePrimary, replaceSecondary })}>应用到工作区</button>
          </div>
        </div>
      )}
    </section>
  )
}

import { clampTokenValues, cloneTokens, contrastRatio, normalizeColor, normalizeTokens, themeTokens, validateTokens } from '../domain/brandRules'
import { generatePrimaryScale, normalizeSeed, stopColor } from '../domain/paletteGenerator'
import type { BrandRepository } from '../repositories/brandRepository'
import type { BrandGuidelinesExporter } from '../services/exportService'
import { INITIAL_TOKENS, type BrandDocument, type BrandMirrorSnapshot, type BrandTheme, type PaletteApplyTargets, type PaletteDraft, type SavedVersion, type TokenCheckpoint } from '../models/brandMirrorModels'

type Listener = () => void

const DARK_SURFACE = '#191829'
const LIGHT_SURFACE = '#FFFFFF'

export class BrandMirrorViewModel {
  private snapshot: BrandMirrorSnapshot = this.makeSnapshot({ tokens: INITIAL_TOKENS, theme: 'studio', versions: [] })
  private readonly listeners = new Set<Listener>()
  private readonly repository: BrandRepository
  private readonly exporter?: BrandGuidelinesExporter
  private checkpoint: TokenCheckpoint | null = null

  constructor(repository: BrandRepository, exporter?: BrandGuidelinesExporter) {
    this.repository = repository
    this.exporter = exporter
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot(): BrandMirrorSnapshot {
    return this.snapshot
  }

  initialize(): void {
    const stored = this.repository.load()
    if (stored) {
      this.checkpoint = stored.checkpoint ? { ...stored.checkpoint, tokens: normalizeTokens(stored.checkpoint.tokens) } : null
      this.snapshot = this.makeSnapshot(stored, this.checkpoint ? '已恢复最近一次工作状态，可退回上一次色板' : '已恢复最近一次工作状态')
    } else {
      this.snapshot = this.makeSnapshot({ tokens: INITIAL_TOKENS, theme: 'studio', versions: [] }, '从 Studio warm 开始探索')
    }
    this.emit()
  }

  selectTheme(theme: BrandTheme): void {
    this.update({ tokens: themeTokens(theme), theme }, '已切换基础主题')
  }

  updateColor(field: 'primary' | 'secondary', value: string): void {
    const color = normalizeColor(value)
    this.update({ tokens: { ...this.snapshot.tokens, [field]: color } }, '令牌已更新')
  }

  updateScale(field: 'radiusScale' | 'spacingScale' | 'typeScale', index: number, value: number): void {
    const values = [...this.snapshot.tokens[field]]
    values[index] = Number.isFinite(value) ? value : values[index]
    this.update({ tokens: clampTokenValues({ ...this.snapshot.tokens, [field]: values }) }, '令牌已更新')
  }

  reset(): void {
    this.update({ tokens: cloneTokens(INITIAL_TOKENS), theme: 'studio' }, '已恢复默认令牌')
  }

  /* --------------------- 种子色梯度生成 --------------------- */

  /**
   * 根据种子色与底色生成整条梯度作为待应用草稿。
   * 此时只预览，不会改动当前工作区令牌。
   */
  previewPalette(seedInput: string, surfaceInput: string): void {
    const seed = normalizeSeed(seedInput)
    if (!seed) {
      this.snapshot = { ...this.snapshot, status: 'error', message: '请输入 6 位 HEX 种子色后再生成' }
      this.emit()
      return
    }
    const surface = surfaceInput.trim().toUpperCase() === DARK_SURFACE ? DARK_SURFACE : LIGHT_SURFACE
    const scale = generatePrimaryScale({ seed, surface })
    const draft: PaletteDraft = {
      seed,
      surface,
      generatedAt: new Date().toISOString(),
      stops: scale.stops,
      failingTextSteps: scale.stops.filter((stop) => !stop.passesText).map((stop) => stop.step),
      failingSurfaceSteps: scale.stops.filter((stop) => !stop.passesSurface).map((stop) => stop.step),
    }
    this.snapshot = {
      ...this.snapshot,
      status: 'ready',
      paletteDraft: draft,
      message: draft.failingTextSteps.length === 0 ? '梯度已生成，全部档位满足正文可读性' : `梯度已生成，${draft.failingTextSteps.join(' / ')} 档种子色仅满足大字对比`,
    }
    this.emit()
  }

  /** 放弃生成结果，保留当前令牌不变 */
  discardPalette(): void {
    if (!this.snapshot.paletteDraft) return
    this.snapshot = { ...this.snapshot, paletteDraft: null, message: '已放弃本次梯度草稿' }
    this.emit()
  }

  /**
   * 把草稿整体应用到工作区：
   * 主色梯度始终写入；primary / secondary 是否覆盖由用户选择，
   * 其余令牌（圆角 / 间距 / 字体比例）永远原样保留。
   * 应用前自动留下检查点，可整体退回。
   */
  applyPalette(targets: PaletteApplyTargets): void {
    const draft = this.snapshot.paletteDraft
    if (!draft) return
    const previous = this.snapshot
    this.checkpoint = {
      tokens: cloneTokens(previous.tokens),
      theme: previous.theme,
      label: `色板应用 · ${draft.seed}`,
      createdAt: new Date().toISOString(),
    }
    const scale = { seed: draft.seed, stops: draft.stops.map((stop) => ({ ...stop })) }
    const tokens: BrandDocument['tokens'] = {
      ...cloneTokens(previous.tokens),
      primaryScale: scale,
    }
    if (targets.replacePrimary) tokens.primary = draft.seed
    if (targets.replaceSecondary) tokens.secondary = stopColor(scale, 900)
    this.persist({ tokens, theme: previous.theme, versions: previous.versions }, '梯度已应用到工作区，并已同步预览 / 版本 / 导出')
    this.snapshot = { ...this.snapshot, paletteDraft: null }
    this.emit()
  }

  /** 退回上一次应用色板之前的令牌 */
  revertPalette(): void {
    if (!this.checkpoint) return
    const restored = this.checkpoint
    this.checkpoint = null
    const tokens = cloneTokens(restored.tokens)
    this.persist({ tokens, theme: restored.theme, versions: this.snapshot.versions }, `已退回到「${restored.label}」之前的令牌`)
    this.snapshot = { ...this.snapshot, paletteDraft: null }
    this.emit()
  }

  saveVersion(): void {
    const validationError = validateTokens(this.snapshot.tokens)
    if (validationError) {
      this.snapshot = { ...this.snapshot, status: 'error', message: validationError }
      this.emit()
      return
    }
    const nextVersion: SavedVersion = {
      id: `version-${Date.now()}`,
      label: this.snapshot.versions.length === 0 ? 'Version A' : `Version ${String.fromCharCode(65 + this.snapshot.versions.length)}`,
      tokens: cloneTokens(this.snapshot.tokens),
      createdAt: new Date().toISOString(),
    }
    const versions = [...this.snapshot.versions, nextVersion]
    this.persist({ tokens: this.snapshot.tokens, theme: this.snapshot.theme, versions }, '版本已保存')
  }

  toggleCompare(): void {
    this.snapshot = { ...this.snapshot, compareMode: !this.snapshot.compareMode, message: this.snapshot.compareMode ? '已退出对比模式' : '正在对比最近两个版本' }
    this.emit()
  }

  exportBrandGuidelines(): void {
    if (!this.exporter) return
    try {
      this.exporter.export(this.snapshot)
      this.snapshot = { ...this.snapshot, message: '品牌规范已导出' }
    } catch {
      this.snapshot = { ...this.snapshot, status: 'error', message: '导出失败，请稍后重试' }
    }
    this.emit()
  }

  private update(partial: Partial<Pick<BrandDocument, 'tokens' | 'theme'>>, message: string): void {
    const tokens = partial.tokens ?? this.snapshot.tokens
    this.snapshot = this.makeSnapshot({ tokens, theme: partial.theme ?? this.snapshot.theme, versions: this.snapshot.versions }, message, 'editing')
    this.persistCurrent()
  }

  private persistCurrent(): void {
    try {
      this.repository.save({ version: 1, tokens: this.snapshot.tokens, theme: this.snapshot.theme, versions: this.snapshot.versions, checkpoint: this.checkpoint ?? undefined })
    } catch {
      this.snapshot = { ...this.snapshot, status: 'error', message: '本地保存失败，但当前编辑仍保留在页面中' }
    }
    this.emit()
  }

  private persist(document: Omit<BrandDocument, 'version' | 'checkpoint'>, message: string): void {
    try {
      this.repository.save({ version: 1, ...document, checkpoint: this.checkpoint ?? undefined })
      this.snapshot = this.makeSnapshot(document, message, 'ready')
    } catch {
      this.snapshot = { ...this.snapshot, status: 'error', message: '本地保存失败，请稍后重试' }
    }
    this.emit()
  }

  private makeSnapshot(document: Omit<BrandDocument, 'version' | 'checkpoint'>, message = '', status: BrandMirrorSnapshot['status'] = 'ready'): BrandMirrorSnapshot {
    const tokens = normalizeTokens(document.tokens)
    const versions = document.versions.map((version) => ({ ...version, tokens: normalizeTokens(version.tokens) }))
    const ratio = contrastRatio(tokens.primary, tokens.secondary)
    const latestVersion = versions[versions.length - 1]
    return { status, tokens, theme: document.theme, versions, compareMode: false, activeVersionId: latestVersion?.id ?? null, contrastRatio: ratio, contrastWarning: ratio < 3, message, paletteDraft: this.snapshot?.paletteDraft ?? null, checkpoint: this.checkpoint }
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener())
  }
}

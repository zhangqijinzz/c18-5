import { clampTokenValues, cloneTokens, contrastRatio, mergeGeneratedScale, normalizeColor, themeTokens, validateTokens } from '../domain/brandRules'
import { ensurePrimaryScale } from '../domain/brandRules'
import { generateColorScale } from '../color-scale/scaleGenerator'
import type { BrandRepository } from '../repositories/brandRepository'
import type { BrandGuidelinesExporter } from '../services/exportService'
import { INITIAL_TOKENS, type BrandDocument, type BrandMirrorSnapshot, type BrandTheme, type PendingScale, type SavedVersion, type TokenSection } from '../models/brandMirrorModels'

type Listener = () => void

const DEFAULT_SECTIONS: Record<TokenSection, boolean> = {
  primaryScale: true,
  primary: true,
  secondary: false,
  radiusScale: false,
  spacingScale: false,
  typeScale: false,
}

export class BrandMirrorViewModel {
  private snapshot: BrandMirrorSnapshot = this.makeSnapshot({ tokens: INITIAL_TOKENS, theme: 'studio', versions: [] })
  private readonly listeners = new Set<Listener>()
  private readonly repository: BrandRepository
  private readonly exporter?: BrandGuidelinesExporter

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
      this.snapshot = this.makeSnapshot(stored, '已恢复最近一次工作状态', 'ready', { pendingScale: null, lastAppliedScale: stored.lastAppliedScale ?? null })
    } else {
      this.snapshot = this.makeSnapshot({ tokens: INITIAL_TOKENS, theme: 'studio', versions: [] }, '从 Studio warm 开始探索')
    }
    this.emit()
  }

  selectTheme(theme: BrandTheme): void {
    this.update({ tokens: themeTokens(theme), theme }, '已切换基础主题', { pendingScale: null, lastAppliedScale: null })
  }

  updateColor(field: 'primary' | 'secondary', value: string): void {
    const color = normalizeColor(value)
    let tokens = { ...this.snapshot.tokens, [field]: color }
    // 手工改主色时让梯度跟着重新派生，保持深浅有序；改辅助色只更新墨色。
    if (field === 'primary') tokens = { ...tokens, primaryScale: ensurePrimaryScale({ ...tokens, primaryScale: undefined }) }
    this.update({ tokens }, '令牌已更新', { pendingScale: null, lastAppliedScale: this.snapshot.lastAppliedScale })
  }

  updateScale(field: 'radiusScale' | 'spacingScale' | 'typeScale', index: number, value: number): void {
    const values = [...this.snapshot.tokens[field]]
    values[index] = Number.isFinite(value) ? value : values[index]
    this.update({ tokens: clampTokenValues({ ...this.snapshot.tokens, [field]: values }) }, '令牌已更新', { pendingScale: null, lastAppliedScale: this.snapshot.lastAppliedScale })
  }

  reset(): void {
    this.update({ tokens: cloneTokens(INITIAL_TOKENS), theme: 'studio' }, '已恢复默认令牌', { pendingScale: null, lastAppliedScale: null })
  }

  /** 从种子色生成梯度草稿。草稿不入库，应用后才写入工作区。 */
  previewColorScale(seedInput: string): void {
    const seed = seedInput.trim().toUpperCase()
    const generated = generateColorScale(seed, { darkInk: this.snapshot.tokens.secondary })
    if (!generated) {
      this.snapshot = { ...this.snapshot, status: 'error', message: '请输入 6 位 HEX 种子色，例如 #F15A47' }
      this.emit()
      return
    }
    const pending: PendingScale = {
      id: `scale-${Date.now()}`,
      seed,
      scale: generated.hexes,
      anchorHex: generated.report.anchorHex,
      anchorAdjusted: generated.report.anchorAdjusted,
      anchorBodyPasses: generated.report.anchorBodyPasses,
      sections: { ...DEFAULT_SECTIONS },
      previousTokens: cloneTokens(this.snapshot.tokens),
      createdAt: new Date().toISOString(),
    }
    const anchorNote = generated.report.anchorAdjusted
      ? `500 锚点微调至 ${generated.report.anchorHex}（种子色对两种墨色均低于大字号对比）`
      : generated.report.anchorBodyPasses
        ? '500 锚点保持种子色，压字达到正文对比'
        : '500 锚点保持种子色，建议用于大字号或图形，正文请用 600/400'
    const failNote = generated.report.failingStops.length > 0 ? `，${generated.report.failingStops.join('/')} 级仅建议做大字号或图形` : ''
    this.snapshot = { ...this.snapshot, status: 'ready', pendingScale: pending, message: `已从 ${seed} 生成 10 级梯度 · ${anchorNote}${failNote}` }
    this.emit()
  }

  toggleScaleSection(section: TokenSection): void {
    const pending = this.snapshot.pendingScale
    if (!pending) return
    const sections = { ...pending.sections, [section]: !pending.sections[section] }
    // 500 主值随梯度一起被保留/覆盖时更直观：关掉梯度则主值也不再覆盖。
    if (section === 'primaryScale' && !sections.primaryScale) sections.primary = false
    if (section === 'primary' && sections.primary) sections.primaryScale = true
    if (!sections.primaryScale && !sections.primary && !sections.secondary) {
      this.snapshot = { ...this.snapshot, status: 'error', message: '至少保留一个要应用的颜色分区' }
      this.emit()
      return
    }
    this.snapshot = { ...this.snapshot, pendingScale: { ...pending, sections }, status: 'ready', message: '已调整应用范围，未勾选项保持现有令牌' }
    this.emit()
  }

  /** 把草稿按所选分区整体写入工作区（预览 / 版本 / 导出共用同一份令牌）。 */
  applyColorScale(): void {
    const pending = this.snapshot.pendingScale
    if (!pending) return
    const tokens = clampTokenValues(mergeGeneratedScale(this.snapshot.tokens, pending.scale, pending.sections))
    const kept = (Object.keys(pending.sections) as TokenSection[]).filter((key) => !pending.sections[key])
    const keptNote = kept.length > 0 ? ` · 已保留 ${kept.length} 个分区` : ''
    this.update(
      { tokens },
      `梯度已应用到工作区${keptNote}，可一键退回生成前`,
      { pendingScale: null, lastAppliedScale: { ...pending, previousTokens: cloneTokens(this.snapshot.tokens) } },
      'ready',
    )
  }

  discardPendingScale(): void {
    if (!this.snapshot.pendingScale) return
    this.snapshot = { ...this.snapshot, pendingScale: null, message: '已放弃本次梯度草稿，现有令牌未改动' }
    this.emit()
  }

  /** 退回生成之前的令牌；未被本次生成覆盖、之后手工改过的部分也一并回到应用前快照。 */
  revertLastScale(): void {
    const applied = this.snapshot.lastAppliedScale
    if (!applied) return
    this.update(
      { tokens: cloneTokens(applied.previousTokens) },
      `已退回 ${applied.seed} 梯度生成之前的令牌`,
      { pendingScale: null, lastAppliedScale: null },
    )
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

  private update(partial: Partial<Pick<BrandDocument, 'tokens' | 'theme'>>, message: string, carry?: { pendingScale: PendingScale | null; lastAppliedScale: PendingScale | null }, status: BrandMirrorSnapshot['status'] = 'editing'): void {
    const tokens = partial.tokens ?? this.snapshot.tokens
    this.snapshot = this.makeSnapshot(
      { tokens, theme: partial.theme ?? this.snapshot.theme, versions: this.snapshot.versions },
      message,
      status,
      carry ?? { pendingScale: this.snapshot.pendingScale, lastAppliedScale: this.snapshot.lastAppliedScale },
    )
    this.persistCurrent()
  }

  private persistCurrent(): void {
    try {
      this.repository.save({ version: 1, tokens: this.snapshot.tokens, theme: this.snapshot.theme, versions: this.snapshot.versions, lastAppliedScale: this.snapshot.lastAppliedScale ?? undefined })
    } catch {
      this.snapshot = { ...this.snapshot, status: 'error', message: '本地保存失败，但当前编辑仍保留在页面中' }
    }
    this.emit()
  }

  private persist(document: Omit<BrandDocument, 'version'>, message: string): void {
    try {
      this.repository.save({ version: 1, ...document, lastAppliedScale: this.snapshot.lastAppliedScale ?? undefined })
      this.snapshot = this.makeSnapshot(document, message, 'ready', { pendingScale: null, lastAppliedScale: this.snapshot.lastAppliedScale })
    } catch {
      this.snapshot = { ...this.snapshot, status: 'error', message: '版本保存失败，请稍后重试' }
    }
    this.emit()
  }

  private makeSnapshot(document: Omit<BrandDocument, 'version'>, message = '', status: BrandMirrorSnapshot['status'] = 'ready', carry?: { pendingScale: PendingScale | null; lastAppliedScale: PendingScale | null }): BrandMirrorSnapshot {
    const tokens = { ...cloneTokens(document.tokens), primaryScale: ensurePrimaryScale(document.tokens) }
    const ratio = contrastRatio(tokens.primary, tokens.secondary)
    const latestVersion = document.versions[document.versions.length - 1]
    return {
      status,
      tokens,
      theme: document.theme,
      versions: document.versions,
      compareMode: false,
      activeVersionId: latestVersion?.id ?? null,
      contrastRatio: ratio,
      contrastWarning: ratio < 3,
      message,
      pendingScale: carry?.pendingScale ?? null,
      lastAppliedScale: carry?.lastAppliedScale ?? null,
    }
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener())
  }
}

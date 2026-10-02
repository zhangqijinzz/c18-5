import { describe, expect, it } from 'vitest'
import { BrandMirrorViewModel } from '../viewmodels/brandMirrorViewModel'
import type { BrandDocument } from '../models/brandMirrorModels'
import type { BrandRepository } from '../repositories/brandRepository'
import { buildBrandGuidelinesMarkdown, type BrandGuidelinesExporter } from '../services/exportService'

class MemoryRepository implements BrandRepository {
  document: BrandDocument | null = null
  shouldFail = false
  load(): BrandDocument | null { return this.document }
  save(document: BrandDocument): void { if (this.shouldFail) throw new Error('offline'); this.document = document }
}

class MemoryExporter implements BrandGuidelinesExporter {
  received: string | null = null
  export(snapshot: Parameters<BrandGuidelinesExporter['export']>[0]): void { this.received = buildBrandGuidelinesMarkdown(snapshot) }
}

describe('BrandMirrorViewModel', () => {
  it('initializes, updates tokens and persists the latest state', () => {
    const repository = new MemoryRepository()
    const viewModel = new BrandMirrorViewModel(repository)
    viewModel.initialize()
    viewModel.updateColor('primary', '#123456')
    viewModel.updateScale('typeScale', 0, 18)
    expect(viewModel.getSnapshot().tokens.primary).toBe('#123456')
    expect(viewModel.getSnapshot().tokens.typeScale[0]).toBe(18)
    expect(repository.document?.tokens.primary).toBe('#123456')
  })

  it('saves two versions and enters comparison mode', () => {
    const repository = new MemoryRepository()
    const viewModel = new BrandMirrorViewModel(repository)
    viewModel.initialize()
    viewModel.saveVersion()
    viewModel.updateColor('primary', '#238B73')
    viewModel.saveVersion()
    viewModel.toggleCompare()
    expect(viewModel.getSnapshot().versions.map((version) => version.label)).toEqual(['Version A', 'Version B'])
    expect(viewModel.getSnapshot().compareMode).toBe(true)
  })

  it('keeps editing usable when persistence fails', () => {
    const repository = new MemoryRepository()
    const viewModel = new BrandMirrorViewModel(repository)
    viewModel.initialize()
    repository.shouldFail = true
    viewModel.updateColor('secondary', '#FFFFFF')
    expect(viewModel.getSnapshot().status).toBe('error')
    expect(viewModel.getSnapshot().tokens.secondary).toBe('#FFFFFF')
  })

  it('recovers a previously persisted document on initialization', () => {
    const repository = new MemoryRepository()
    repository.document = { version: 1, theme: 'night', tokens: { primary: '#A98BFF', secondary: '#191829', radiusScale: [6, 10, 14, 22], spacingScale: [4, 8, 12, 18, 28], typeScale: [12, 14, 16, 20, 28, 38] }, versions: [] }
    const viewModel = new BrandMirrorViewModel(repository)
    viewModel.initialize()
    expect(viewModel.getSnapshot().theme).toBe('night')
    expect(viewModel.getSnapshot().message).toContain('恢复')
  })

  it('exports the current token system as brand guidelines', () => {
    const repository = new MemoryRepository()
    const exporter = new MemoryExporter()
    const viewModel = new BrandMirrorViewModel(repository, exporter)
    viewModel.initialize()
    viewModel.exportBrandGuidelines()
    expect(exporter.received).toContain('# BrandMirror 品牌规范')
    expect(exporter.received).toContain('`primary`')
    expect(viewModel.getSnapshot().message).toContain('导出')
  })

  it('previews a generated palette without touching workspace tokens', () => {
    const repository = new MemoryRepository()
    const viewModel = new BrandMirrorViewModel(repository)
    viewModel.initialize()
    const before = viewModel.getSnapshot().tokens.primary
    viewModel.previewPalette('#238B73', '#FFFFFF')
    const draft = viewModel.getSnapshot().paletteDraft
    expect(draft).not.toBeNull()
    expect(draft?.stops).toHaveLength(10)
    expect(draft?.stops[5].color).toBe('#238B73')
    expect(viewModel.getSnapshot().tokens.primary).toBe(before)
    // 仅预览不落盘：没有任何写入动作时仓库保持为空
    expect(repository.document).toBeNull()
    viewModel.discardPalette()
    expect(viewModel.getSnapshot().paletteDraft).toBeNull()
  })

  it('rejects an invalid seed and keeps editing', () => {
    const repository = new MemoryRepository()
    const viewModel = new BrandMirrorViewModel(repository)
    viewModel.initialize()
    viewModel.previewPalette('not-a-color', '#FFFFFF')
    expect(viewModel.getSnapshot().paletteDraft).toBeNull()
    expect(viewModel.getSnapshot().status).toBe('error')
  })

  it('applies the ramp, preserves unchecked tokens and scales, then reverts to the checkpoint', () => {
    const repository = new MemoryRepository()
    const viewModel = new BrandMirrorViewModel(repository)
    viewModel.initialize()
    viewModel.updateScale('radiusScale', 0, 33)
    const originalPrimary = viewModel.getSnapshot().tokens.primary
    const originalSecondary = viewModel.getSnapshot().tokens.secondary

    viewModel.previewPalette('#238B73', '#FFFFFF')
    // 默认只覆盖 primary 与梯度，secondary / 尺度体系保留
    viewModel.applyPalette({ replacePrimary: true, replaceSecondary: false })

    const applied = viewModel.getSnapshot()
    expect(applied.paletteDraft).toBeNull()
    expect(applied.tokens.primaryScale?.stops).toHaveLength(10)
    expect(applied.tokens.primary).toBe('#238B73')
    expect(applied.tokens.secondary).toBe(originalSecondary)
    expect(applied.tokens.radiusScale[0]).toBe(33)
    expect(applied.checkpoint).not.toBeNull()
    expect(repository.document?.checkpoint).not.toBeUndefined()

    // 单独保留 secondary 已验证；再退回，应恢复到应用前的全部令牌（含旧主色）
    viewModel.revertPalette()
    const reverted = viewModel.getSnapshot()
    expect(reverted.tokens.primary).toBe(originalPrimary)
    expect(reverted.tokens.secondary).toBe(originalSecondary)
    expect(reverted.tokens.radiusScale[0]).toBe(33)
    expect(reverted.checkpoint).toBeNull()
  })

  it('can also replace secondary with the 900 stop', () => {
    const repository = new MemoryRepository()
    const viewModel = new BrandMirrorViewModel(repository)
    viewModel.initialize()
    viewModel.previewPalette('#238B73', '#FFFFFF')
    viewModel.applyPalette({ replacePrimary: false, replaceSecondary: true })
    const tokens = viewModel.getSnapshot().tokens
    expect(tokens.primary).toBe('#F15A47')
    expect(tokens.secondary).toBe(tokens.primaryScale?.stops[9].color)
  })

  it('persists the checkpoint across re-initialization so revert survives a reload', () => {
    const repository = new MemoryRepository()
    const first = new BrandMirrorViewModel(repository)
    first.initialize()
    first.previewPalette('#238B73', '#FFFFFF')
    first.applyPalette({ replacePrimary: true, replaceSecondary: false })

    const second = new BrandMirrorViewModel(repository)
    second.initialize()
    expect(second.getSnapshot().checkpoint).not.toBeNull()
    expect(second.getSnapshot().tokens.primaryScale?.stops).toHaveLength(10)
    second.revertPalette()
    expect(second.getSnapshot().tokens.primary).toBe('#F15A47')
  })

  it('migrates legacy documents without a primaryScale', () => {
    const repository = new MemoryRepository()
    repository.document = { version: 1, theme: 'studio', tokens: { primary: '#F15A47', secondary: '#24324A', radiusScale: [8, 12, 18, 28], spacingScale: [4, 8, 12, 20, 32], typeScale: [12, 14, 16, 20, 28, 40] }, versions: [] }
    const viewModel = new BrandMirrorViewModel(repository)
    viewModel.initialize()
    expect(viewModel.getSnapshot().tokens.primaryScale?.stops).toHaveLength(10)
    expect(viewModel.getSnapshot().tokens.primaryScale?.stops[5].color).toBe('#F15A47')
  })

  it('includes the full gradient when exporting brand guidelines', () => {
    const repository = new MemoryRepository()
    const exporter = new MemoryExporter()
    const viewModel = new BrandMirrorViewModel(repository, exporter)
    viewModel.initialize()
    viewModel.previewPalette('#238B73', '#FFFFFF')
    viewModel.applyPalette({ replacePrimary: true, replaceSecondary: false })
    viewModel.exportBrandGuidelines()
    expect(exporter.received).toContain('## 主色梯度')
    expect(exporter.received).toContain('primary.500')
    expect(exporter.received).toContain('#238B73')
  })
})

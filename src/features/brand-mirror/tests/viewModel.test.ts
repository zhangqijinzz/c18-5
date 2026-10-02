import { describe, expect, it } from 'vitest'
import { BrandMirrorViewModel } from '../viewmodels/brandMirrorViewModel'
import { INITIAL_TOKENS, type BrandDocument } from '../models/brandMirrorModels'
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

  it('generates a scale draft without touching the workspace until applied', () => {
    const repository = new MemoryRepository()
    const viewModel = new BrandMirrorViewModel(repository)
    viewModel.initialize()
    viewModel.updateColor('secondary', '#24324A')
    const before = viewModel.getSnapshot().tokens.primary
    expect(repository.document?.tokens.primary).toBe(before)
    viewModel.previewColorScale('#3366CC')
    const draft = viewModel.getSnapshot().pendingScale
    expect(draft).not.toBeNull()
    if (draft) expect(draft.scale).toHaveLength(10)
    expect(viewModel.getSnapshot().tokens.primary).toBe(before)
    expect(repository.document?.tokens.primary).toBe(before)
  })

  it('applies the generated scale, keeps unticked sections, and reverts to pre-generation tokens', () => {
    const repository = new MemoryRepository()
    const viewModel = new BrandMirrorViewModel(repository)
    viewModel.initialize()
    const previousSecondary = viewModel.getSnapshot().tokens.secondary
    const previousRadius = [...viewModel.getSnapshot().tokens.radiusScale]
    viewModel.previewColorScale('#3366CC')
    viewModel.applyColorScale()
    const applied = viewModel.getSnapshot()
    expect(applied.pendingScale).toBeNull()
    expect(applied.tokens.primaryScale).toHaveLength(10)
    expect(applied.tokens.primary).toBe(applied.tokens.primaryScale?.[5])
    // secondary 与尺度默认不在应用范围内，应原样保留
    expect(applied.tokens.secondary).toBe(previousSecondary)
    expect(applied.tokens.radiusScale).toEqual(previousRadius)
    expect(applied.lastAppliedScale).not.toBeNull()

    viewModel.revertLastScale()
    const reverted = viewModel.getSnapshot()
    expect(reverted.tokens.primary).toBe(INITIAL_TOKENS.primary)
    expect(reverted.tokens.primaryScale).toEqual(INITIAL_TOKENS.primaryScale)
    expect(reverted.lastAppliedScale).toBeNull()
  })

  it('can include secondary in the application and discard a draft instead', () => {
    const repository = new MemoryRepository()
    const viewModel = new BrandMirrorViewModel(repository)
    viewModel.initialize()
    viewModel.previewColorScale('#238B73')
    viewModel.toggleScaleSection('secondary')
    viewModel.applyColorScale()
    const scale = viewModel.getSnapshot().tokens.primaryScale ?? []
    expect(scale).toHaveLength(10)
    expect(viewModel.getSnapshot().tokens.secondary).toBe(scale[9])
    viewModel.revertLastScale()
    expect(viewModel.getSnapshot().tokens.secondary).toBe('#24324A')

    viewModel.previewColorScale('#A98BFF')
    const untouched = viewModel.getSnapshot().tokens.primary
    viewModel.discardPendingScale()
    expect(viewModel.getSnapshot().pendingScale).toBeNull()
    expect(viewModel.getSnapshot().tokens.primary).toBe(untouched)
  })

  it('keeps revert available across reload via the repository', () => {
    const repository = new MemoryRepository()
    const first = new BrandMirrorViewModel(repository)
    first.initialize()
    first.previewColorScale('#114488')
    first.applyColorScale()
    const generatedPrimary = first.getSnapshot().tokens.primary

    const second = new BrandMirrorViewModel(repository)
    second.initialize()
    expect(second.getSnapshot().tokens.primary).toBe(generatedPrimary)
    expect(second.getSnapshot().lastAppliedScale).not.toBeNull()
    second.revertLastScale()
    expect(second.getSnapshot().tokens.primary).toBe('#F15A47')
  })

  it('flags an invalid seed color', () => {
    const repository = new MemoryRepository()
    const viewModel = new BrandMirrorViewModel(repository)
    viewModel.initialize()
    viewModel.previewColorScale('blue')
    expect(viewModel.getSnapshot().status).toBe('error')
    expect(viewModel.getSnapshot().message).toContain('HEX')
  })
})

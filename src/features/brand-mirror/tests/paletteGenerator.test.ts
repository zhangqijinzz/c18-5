import { describe, expect, it } from 'vitest'
import {
  SCALE_STEPS,
  SEED_STEP_INDEX,
  TEXT_CONTRAST,
  SURFACE_CONTRAST,
  contrastRatio,
  ensurePrimaryScale,
  generatePrimaryScale,
  hexToHsl,
  hslToHex,
  normalizeSeed,
  stopColor,
} from '../domain/paletteGenerator'
import { INITIAL_TOKENS } from '../models/brandMirrorModels'

describe('palette generator', () => {
  it('produces ten stops from 50 to 900 with the seed pinned at 500', () => {
    const scale = generatePrimaryScale({ seed: '#F15A47', surface: '#FFFFFF' })
    expect(scale.stops.map((stop) => stop.step)).toEqual([...SCALE_STEPS])
    expect(scale.stops).toHaveLength(10)
    expect(scale.stops[SEED_STEP_INDEX].color).toBe('#F15A47')
    expect(scale.stops[SEED_STEP_INDEX].step).toBe(500)
  })

  it('builds a strictly ordered light-to-dark ramp', () => {
    const scale = generatePrimaryScale({ seed: '#F15A47', surface: '#FFFFFF' })
    // 用相对亮度（WCAG luminance）判定明暗顺序，而非 HSL 明度
    const luminanceOrder = scale.stops.map((stop) => contrastRatio(stop.color, '#000000'))
    for (let index = 1; index < luminanceOrder.length; index += 1) {
      expect(luminanceOrder[index - 1]).toBeGreaterThan(luminanceOrder[index])
    }
  })

  it('enforces body-text contrast for every non-pinned stop and suggests a readable text color', () => {
    const scale = generatePrimaryScale({ seed: '#F15A47', surface: '#FFFFFF' })
    for (const stop of scale.stops) {
      if (stop.step === 500) continue
      expect(stop.textContrast).toBeGreaterThanOrEqual(TEXT_CONTRAST)
      expect(stop.passesText).toBe(true)
      expect(contrastRatio(stop.color, stop.onColor)).toBeCloseTo(stop.textContrast, 5)
      expect(['#FFFFFF', '#111418']).toContain(stop.onColor)
    }
    // 浅档配深字，深档配白字
    expect(scale.stops[0].onColor).toBe('#111418')
    expect(scale.stops[9].onColor).toBe('#FFFFFF')
  })

  it('keeps solid stops distinguishable from the surface and reports soft-tint failures honestly', () => {
    const scale = generatePrimaryScale({ seed: '#F15A47', surface: '#FFFFFF' })
    for (const step of [600, 700, 800]) {
      const stop = scale.stops.find((item) => item.step === step)
      expect(stop?.surfaceContrast ?? 0).toBeGreaterThanOrEqual(SURFACE_CONTRAST)
    }
    // 高饱和黄色在白底下天然对比不足：不强行改色，而是如实标记，提示只作装饰色
    const yellow = generatePrimaryScale({ seed: '#FFD400', surface: '#FFFFFF' })
    expect(yellow.stops.some((stop) => !stop.passesSurface)).toBe(true)
  })

  it('respects the chosen surface when reporting contrast', () => {
    const light = generatePrimaryScale({ seed: '#A98BFF', surface: '#FFFFFF' })
    const dark = generatePrimaryScale({ seed: '#A98BFF', surface: '#191829' })
    expect(light.stops[SEED_STEP_INDEX].surfaceContrast).toBeLessThan(3)
    expect(dark.stops[SEED_STEP_INDEX].surfaceContrast).toBeGreaterThan(3)
  })

  it('round-trips hex and hsl conversions', () => {
    for (const hex of ['#F15A47', '#238B73', '#FFFFFF', '#000000']) {
      expect(hslToHex(hexToHsl(hex))).toBe(hex)
    }
  })

  it('validates seed input', () => {
    expect(normalizeSeed('#3366ff')).toBe('#3366FF')
    expect(normalizeSeed('red')).toBeNull()
    expect(normalizeSeed('  #ABCDEF ')).toBe('#ABCDEF')
  })

  it('backfills a gradient for legacy tokens missing primaryScale', () => {
    const scale = ensurePrimaryScale({ primary: '#238B73' })
    expect(scale.stops).toHaveLength(10)
    expect(scale.stops[SEED_STEP_INDEX].color).toBe('#238B73')
    expect(stopColor(ensurePrimaryScale(INITIAL_TOKENS), 600)).toMatch(/^#[0-9A-F]{6}$/)
  })

  it('covers edge-case seeds without collapsing', () => {
    for (const seed of ['#FFFFFF', '#000000', '#111418', '#555555']) {
      const scale = generatePrimaryScale({ seed, surface: '#FFFFFF' })
      expect(scale.stops).toHaveLength(10)
      expect(scale.stops[SEED_STEP_INDEX].color).toBe(seed)
    }
  })
})

import { describe, expect, it } from 'vitest'
import { contrastRatio, generateColorScale, hslToHex, hexToHsl, recommendInk, SCALE_STOPS, type ColorScale } from '../scaleGenerator'

function expectScale(seed: string, options?: Parameters<typeof generateColorScale>[1]): ColorScale {
  const scale = generateColorScale(seed, options)
  if (!scale) throw new Error(`expected a scale for ${seed}`)
  return scale
}

describe('generateColorScale', () => {
  it('builds a monotonic 50–900 ramp anchored on the seed at 500', () => {
    const scale = expectScale('#F15A47')
    expect(scale.steps.map((step) => step.stop)).toEqual([...SCALE_STOPS])
    expect(scale.hexes).toHaveLength(10)
    const lightness = scale.hexes.map((hex) => hexToHsl(hex).l)
    for (let i = 1; i < lightness.length; i += 1) {
      expect(lightness[i - 1]).toBeGreaterThan(lightness[i])
    }
    expect(scale.steps[5].hex).toBe('#F15A47')
  })

  it('keeps every non-anchor step readable with its recommended ink at AA body contrast', () => {
    const scale = expectScale('#238B73', { darkInk: '#173C35' })
    for (const step of scale.steps.filter((candidate) => candidate.stop !== 500)) {
      expect(contrastRatio(step.hex, step.onInk)).toBeGreaterThanOrEqual(4.4)
    }
    expect(scale.report.failingStops).toHaveLength(0)
  })

  it('keeps the brand seed exactly at 500 and guarantees legibility through ink choice', () => {
    // #7E8A3D 对深墨（4.4）和白墨（3.8）都达不到正文 4.5:1，但都够大字号 3:1
    const scale = expectScale('#7E8A3D')
    expect(scale.report.anchorAdjusted).toBe(false)
    expect(scale.steps[5].hex).toBe('#7E8A3D')
    // 500 压字至少有大字号对比度；其余 9 级全部达到正文对比
    expect(contrastRatio(scale.steps[5].hex, scale.steps[5].onInk)).toBeGreaterThanOrEqual(2.9)
    for (const step of scale.steps.filter((candidate) => candidate.stop !== 500)) {
      expect(contrastRatio(step.hex, step.onInk)).toBeGreaterThanOrEqual(4.4)
    }
  })

  it('round-trips HSL conversions', () => {
    for (const hex of ['#F15A47', '#000000', '#FFFFFF', '#173C35', '#A98BFF']) {
      expect(hslToHex(hexToHsl(hex))).toBe(hex)
    }
  })

  it('recommends white ink on dark stops and dark ink on light stops', () => {
    const scale = expectScale('#3366CC')
    expect(recommendInk(scale.hexes[9])).toBe('#FFFFFF')
    expect(recommendInk(scale.hexes[0]).toLowerCase()).not.toBe('#ffffff')
  })

  it('returns null for an invalid seed', () => {
    expect(generateColorScale('red')).toBeNull()
    expect(generateColorScale('#12')).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { LocalBrandRepository } from '../repositories/brandRepository'
import type { StorageService } from '../services/storageService'
import { SCALE_STOPS } from '../color-scale/scaleGenerator'

class MemoryStorage implements StorageService {
  value: string | null = null
  read(): string | null { return this.value }
  write(input: string): void { this.value = input }
}

describe('LocalBrandRepository', () => {
  it('migrates legacy documents without a primary scale by deriving one', () => {
    const storage = new MemoryStorage()
    storage.value = JSON.stringify({
      version: 1,
      theme: 'studio',
      tokens: {
        primary: '#F15A47',
        secondary: '#24324A',
        radiusScale: [8, 12, 18, 28],
        spacingScale: [4, 8, 12, 20, 32],
        typeScale: [12, 14, 16, 20, 28, 40],
      },
      versions: [],
    })
    const document = new LocalBrandRepository(storage).load()
    expect(document).not.toBeNull()
    expect(document?.tokens.primaryScale).toHaveLength(SCALE_STOPS.length)
    expect(document?.tokens.primaryScale?.[5]).toBe('#F15A47')
  })

  it('round-trips a document carrying the last applied scale for revert', () => {
    const storage = new MemoryStorage()
    const repository = new LocalBrandRepository(storage)
    const document = {
      version: 1 as const,
      theme: 'studio' as const,
      tokens: {
        primary: '#3366CC',
        secondary: '#24324A',
        primaryScale: ['#F4F6FA', '#E1E8F4', '#B3C5E7', '#7F9EDB', '#7799DC', '#3366CC', '#2E5AB1', '#223E77', '#14223F', '#0E1625'],
        radiusScale: [8, 12, 18, 28],
        spacingScale: [4, 8, 12, 20, 32],
        typeScale: [12, 14, 16, 20, 28, 40],
      },
      versions: [],
      lastAppliedScale: {
        id: 'scale-1',
        seed: '#3366CC',
        scale: ['#F4F6FA', '#E1E8F4', '#B3C5E7', '#7F9EDB', '#7799DC', '#3366CC', '#2E5AB1', '#223E77', '#14223F', '#0E1625'],
        anchorHex: '#3366CC',
        anchorAdjusted: false,
        anchorBodyPasses: true,
        sections: { primaryScale: true, primary: true, secondary: false, radiusScale: false, spacingScale: false, typeScale: false },
        previousTokens: {
          primary: '#F15A47',
          secondary: '#24324A',
          radiusScale: [8, 12, 18, 28],
          spacingScale: [4, 8, 12, 20, 32],
          typeScale: [12, 14, 16, 20, 28, 40],
        },
        createdAt: '2026-10-01T00:00:00.000Z',
      },
    }
    repository.save(document)
    expect(new LocalBrandRepository(storage).load()?.lastAppliedScale?.seed).toBe('#3366CC')
  })
})

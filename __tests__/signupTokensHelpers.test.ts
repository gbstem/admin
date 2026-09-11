import type {} from '../src/data.d.ts'
import { tokenRejection } from '$lib/helpers/signupTokens'

const NOW = new Date('2026-09-10T12:00:00Z')
const token = (overrides: Record<string, unknown> = {}) =>
  ({
    expires: { toDate: () => new Date('2026-09-11T12:00:00Z') },
    consumable: true,
    consumers: [],
    ...overrides,
  }) as any

describe('tokenRejection', () => {
  it('accepts an unexpired, unconsumed token', () => {
    expect(tokenRejection(token(), NOW)).toBeNull()
  })

  it('rejects a token at or past its expiry', () => {
    expect(tokenRejection(token({ expires: { toDate: () => NOW } }), NOW)).toBe(
      'expired',
    )
  })

  it('rejects a single-use token that already has a consumer', () => {
    expect(tokenRejection(token({ consumers: ['uid-1'] }), NOW)).toBe(
      'consumed',
    )
  })

  it('accepts a reusable token however many have used it', () => {
    expect(
      tokenRejection(
        token({ consumable: false, consumers: ['uid-1', 'uid-2'] }),
        NOW,
      ),
    ).toBeNull()
  })

  it('treats a token with no consumers field as unconsumed', () => {
    expect(tokenRejection(token({ consumers: undefined }), NOW)).toBeNull()
  })
})

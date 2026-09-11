import { isKnownRole, KNOWN_ROLES } from '../scripts/lib/knownRoles'

describe('isKnownRole', () => {
  it.each(KNOWN_ROLES)('accepts %s', (role) => {
    expect(isKnownRole(role)).toBe(true)
  })

  it.each([
    ['an unknown string', 'superuser'],
    ['a number', 7],
    ['null', null],
    ['undefined', undefined],
    ['an object', { role: 'admin' }],
  ])('rejects %s', (_label, value) => {
    expect(isKnownRole(value)).toBe(false)
  })
})

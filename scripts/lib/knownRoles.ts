// The role values a custom claim may carry, for scripts/set-user-role.ts.
//
// Kept out of the script itself so it can be unit tested without Auth - see
// __tests__/knownRoles.test.ts and the "Helpers, Services, and Where New Code
// Should Go" section of the README.

/**
 * The role values the two sites accept today.
 *
 * Deliberately a runtime list rather than a reference to `Data.Role`: that
 * type is ambient, differs between this repo and portal, and erases at compile
 * time, so it cannot vet a string typed on a command line.
 */
export const KNOWN_ROLES = [
  'admin',
  'reviewer',
  'instructor',
  'student',
] as const

export type KnownRole = (typeof KNOWN_ROLES)[number]

export function isKnownRole(value: unknown): value is KnownRole {
  return (
    typeof value === 'string' &&
    (KNOWN_ROLES as readonly string[]).includes(value)
  )
}

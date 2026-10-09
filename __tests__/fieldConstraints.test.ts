import {
  constraintAt,
  constraintsStore,
} from '#lib/components/fieldConstraints.js'
import { get, writable } from 'svelte/store'

describe('constraintsStore', () => {
  it("returns a superForm's constraints store itself", () => {
    // Reading `form.constraints` as a plain object is the bug this replaced:
    // it is a store, so every lookup came back empty.
    const constraints = writable({ personal: { gender: { required: true } } })
    expect(constraintsStore({ constraints })).toBe(constraints)
  })

  it('falls back to an empty store for anything else', () => {
    expect(get(constraintsStore(undefined))).toBeUndefined()
    expect(get(constraintsStore({ constraints: { required: true } }))).toBe(
      undefined,
    )
  })
})

describe('constraintAt', () => {
  const constraints = {
    personal: { gender: { required: true } },
    essay: { why: { maxlength: 500 } },
  }

  it('walks a dotted path to one field', () => {
    expect(constraintAt(constraints, 'personal.gender')).toEqual({
      required: true,
    })
    expect(constraintAt(constraints, 'essay.why')).toEqual({ maxlength: 500 })
  })

  it('returns {} for a missing path or missing constraints', () => {
    expect(constraintAt(constraints, 'personal.nope')).toEqual({})
    expect(constraintAt(undefined, 'personal.gender')).toEqual({})
    expect(constraintAt(constraints, '')).toEqual({})
  })
})

// Guards the hand-maintained field lists an application/registration/class value
// passes through on its way to and from Firestore. Each form keeps the same set
// of fields written out three separate times - the Zod schema, a defaults or
// empty-document factory, and the explicit allowlist in `toXFormValues()` - and
// nothing but review currently keeps them in step.
//
// A field present in the schema but missing from `toXFormValues()` is the worst
// case and the reason these tests exist. The same allowlist sits on both the
// read side and the display side, so the omission is invisible in the UI: the
// field shows the schema's default instead of the stored value. Then the save
// writes the validated form data straight back, so that default overwrites what
// was stored. These tests derive the field list from the schema itself, so
// adding a field without wiring it fails here rather than in production.
//
// Ported from the portal repo's test of the same name. The two repos edit the
// same Firestore documents through near-identical schemas, so the shape is
// deliberately kept recognisable between them - but admin's save path differs
// (see the `editedFields` block at the bottom) and the assertions follow admin.
import {
  applicationSchema,
  classSchema,
  getApplyFormDefaults,
  getClassDataDefaults,
  getCreateTokenFormDefaults,
  getInterviewSlotDefaults,
  getRegistrationFormDefaults,
  interviewSlotSchema,
  registrationSchema,
  tokenSchema,
} from '$lib/components/forms/schemas'
import { createDefaultApplicationValues } from '$lib/helpers/application'
import {
  APPLICATION_ADMIN_OWNED_FIELDS,
  applicationEditedFields,
  toApplicationFormValues,
} from '$lib/helpers/editApplicationForm'
import { toClassFormValues } from '$lib/helpers/editClassForm'
import {
  createDefaultRegistrationValues,
  REGISTRATION_ADMIN_OWNED_FIELDS,
  registrationEditedFields,
  toRegistrationFormValues,
} from '$lib/helpers/editRegistrationForm'
import { z } from 'zod'
import type {} from '../src/data.d.ts'

type LeafKind = 'string' | 'number' | 'boolean' | 'array'
type Leaf = { path: string; kind: LeafKind }

/**
 * Peels ZodOptional/ZodDefault/ZodNullable/ZodEffects wrappers off a schema
 * node until the type that actually describes the field is reached.
 */
function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current: any = schema
  for (;;) {
    const def = current?._def
    if (!def) return current
    if (def.innerType) {
      current = def.innerType
    } else if (def.schema) {
      current = def.schema
    } else {
      return current
    }
  }
}

/**
 * Flattens a Zod object schema into dotted leaf paths plus the kind of value
 * each holds. Unknown Zod types throw rather than being skipped, so a schema
 * that grows a type this walker doesn't understand fails loudly instead of
 * quietly dropping that field out of every assertion below.
 */
function schemaLeaves(schema: z.ZodTypeAny, prefix = ''): Leaf[] {
  const node = unwrap(schema)
  if (node instanceof z.ZodObject) {
    return Object.entries(node.shape as Record<string, z.ZodTypeAny>).flatMap(
      ([key, child]) => schemaLeaves(child, prefix ? `${prefix}.${key}` : key),
    )
  }
  let kind: LeafKind
  if (node instanceof z.ZodString || node instanceof z.ZodEnum) {
    kind = 'string'
  } else if (node instanceof z.ZodNumber) {
    kind = 'number'
  } else if (node instanceof z.ZodBoolean) {
    kind = 'boolean'
  } else if (node instanceof z.ZodArray) {
    kind = 'array'
  } else {
    throw new Error(
      `schemaLeaves: unhandled Zod type at "${prefix}" - teach this walker about it`,
    )
  }
  return [{ path: prefix, kind }]
}

/** Flattens a plain object into dotted leaf paths (arrays count as leaves). */
function objectLeaves(value: any, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [prefix]
  }
  return Object.entries(value).flatMap(([key, child]) =>
    objectLeaves(child, prefix ? `${prefix}.${key}` : key),
  )
}

function hasPath(obj: any, path: string): boolean {
  let current = obj
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object' || !(key in current)) {
      return false
    }
    current = current[key]
  }
  return true
}

function getPath(obj: any, path: string): any {
  return path
    .split('.')
    .reduce(
      (acc, key) => (acc === null || acc === undefined ? acc : acc[key]),
      obj,
    )
}

function setPath(obj: any, path: string, value: any): void {
  const keys = path.split('.')
  const last = keys.pop() as string
  let current = obj
  for (const key of keys) {
    if (current[key] === null || typeof current[key] !== 'object') {
      current[key] = {}
    }
    current = current[key]
  }
  current[last] = value
}

/**
 * A value distinguishable from every default the pipeline could substitute.
 * Numbers stay non-zero and `form` booleans stay `true` so that the
 * `|| fallback` and `!== undefined ? ... : false` idioms in the `toXFormValues`
 * mappers can't mask a dropped field by coincidentally producing the same value.
 *
 * `source` distinguishes a value that came from the last-loaded document from
 * one the user just typed. The `ownedFields` tests populate both sides with
 * different sentinels so they can assert which one actually wins - a field that
 * silently falls back to the stored value looks identical to a working one
 * unless the two are told apart.
 */
function sentinelFor(
  leaf: Leaf,
  index: number,
  source: 'values' | 'form' = 'form',
): any {
  switch (leaf.kind) {
    case 'string':
      return `${source}-${leaf.path}`
    case 'number':
      return (source === 'form' ? 3000 : 2000) + index
    case 'boolean':
      return source === 'form'
    case 'array':
      return [`${source}-${leaf.path}`]
  }
}

/** Builds a document with every schema leaf set to its `source` sentinel. */
function populate(base: any, leaves: Leaf[], source: 'values' | 'form'): any {
  const doc = base
  leaves.forEach((leaf, index) => {
    setPath(doc, leaf.path, sentinelFor(leaf, index, source))
  })
  return doc
}

/**
 * Fields `toXFormValues` exposes that the schema deliberately doesn't validate.
 *
 * EditRegistrationForm displays the parent's name but zod strips both fields
 * from the validated data, so they are never written back - which is exactly
 * what stops this form from overwriting them with a stale snapshot. The
 * `editedFields` block below pins that mechanism rather than trusting it.
 */
const REGISTRATION_UNVALIDATED_FIELDS = [
  'personal.parentFirstName',
  'personal.parentLastName',
]
const APPLICATION_UNVALIDATED_FIELDS: string[] = []
const CLASS_UNVALIDATED_FIELDS: string[] = []

const REGISTRATION_FORM = {
  label: 'registration',
  schema: registrationSchema as unknown as z.ZodTypeAny,
  getDefaults: getRegistrationFormDefaults,
  createEmpty: createDefaultRegistrationValues,
  toFormValues: (data: any) => toRegistrationFormValues(data),
  unvalidated: REGISTRATION_UNVALIDATED_FIELDS,
  editedFields: (formData: any) => registrationEditedFields(formData) as any,
  adminOwned: REGISTRATION_ADMIN_OWNED_FIELDS,
}

const APPLICATION_FORM = {
  label: 'application',
  schema: applicationSchema as unknown as z.ZodTypeAny,
  getDefaults: getApplyFormDefaults,
  createEmpty: createDefaultApplicationValues,
  toFormValues: (data: any) => toApplicationFormValues(data),
  unvalidated: APPLICATION_UNVALIDATED_FIELDS,
  editedFields: (formData: any) => applicationEditedFields(formData) as any,
  adminOwned: APPLICATION_ADMIN_OWNED_FIELDS,
}

/**
 * EditClassForm has a shorter pipeline: `ClassData` is flat, and the save is a
 * whole-document `{ ...values, ...formVal.data }` spread rather than an
 * allowlist of groups - so it takes the shared checks but not the
 * `editedFields` block.
 *
 * `getClassDataDefaults` stands in for both factories.
 */
const CLASS_FORM = {
  label: 'class',
  schema: classSchema as unknown as z.ZodTypeAny,
  getDefaults: getClassDataDefaults,
  createEmpty: getClassDataDefaults,
  toFormValues: (data: any) => toClassFormValues(data),
  unvalidated: CLASS_UNVALIDATED_FIELDS,
}

describe('Form field parity', () => {
  describe.each([REGISTRATION_FORM, APPLICATION_FORM, CLASS_FORM])(
    '$label',
    ({ schema, getDefaults, createEmpty, toFormValues, unvalidated }) => {
      const leaves = schemaLeaves(schema)

      test('the schema walker finds a non-trivial set of fields', () => {
        // Cheap canary: if `schemaLeaves` ever silently returns nothing, every
        // other test in this block would vacuously pass.
        expect(leaves.length).toBeGreaterThan(8)
      })

      test.each(leaves)(
        'schema field $path has a default in the form defaults factory',
        ({ path }) => {
          expect(hasPath(getDefaults(), path)).toBe(true)
        },
      )

      test.each(leaves)(
        'schema field $path exists in the empty document factory',
        ({ path }) => {
          expect(hasPath(createEmpty(), path)).toBe(true)
        },
      )

      test('every schema field survives a stored document -> toFormValues', () => {
        // The check that matters most: a field dropped here shows the schema's
        // default in the UI and is then written back over the stored value.
        const populated = populate(createEmpty(), leaves, 'values')
        const formValues = toFormValues(populated)

        leaves.forEach((leaf, index) => {
          expect({
            path: leaf.path,
            value: getPath(formValues, leaf.path),
          }).toEqual({
            path: leaf.path,
            value: sentinelFor(leaf, index, 'values'),
          })
        })
      })

      test('toFormValues exposes no field the schema does not validate', () => {
        const exposed = objectLeaves(toFormValues(createEmpty()))
        const validated = new Set(leaves.map((leaf) => leaf.path))
        const extras = exposed.filter(
          (path) => !validated.has(path) && !unvalidated.includes(path),
        )
        expect(extras).toEqual([])
      })
    },
  )
})

/**
 * Only the two forms that write through an allowlist of document groups.
 *
 * Admin's save path differs from the portal's in a way that matters here: it
 * writes the *validated* form data rather than re-merging the `values`
 * snapshot the dialog opened with. That is what keeps a stale copy of a field
 * this form only displays from being written over a concurrent edit, so these
 * tests pin the validated data going in, not a hand-built merge.
 */
describe.each([REGISTRATION_FORM, APPLICATION_FORM])(
  '$label editedFields',
  ({ schema, createEmpty, toFormValues, editedFields, adminOwned }) => {
    const leaves = schemaLeaves(schema)

    /**
     * What the component passes in: the live form values. Not run through zod
     * here - `graduationYear`'s sentinel would fail the schema's year range -
     * so the stripping guarantee that depends on zod gets its own test below.
     */
    const formData = () => populate(toFormValues(createEmpty()), leaves, 'form')

    // Both services write with `setDoc(..., { merge: true })`, so what this
    // returns is literally what reaches Firestore: a field missing from it
    // keeps whatever the last writer left, with no error.
    test('writes every schema field the form is allowed to own', () => {
      const written = editedFields(formData())
      const missing = leaves
        .filter((leaf) => !adminOwned.includes(leaf.path))
        .filter((leaf) => !hasPath(written, leaf.path))
        .map((leaf) => leaf.path)
      expect(missing).toEqual([])
    })

    test('takes each of those fields from the form', () => {
      const written = editedFields(formData())
      const wrong = leaves
        .filter((leaf) => !adminOwned.includes(leaf.path))
        .filter((leaf, index) => {
          const expected = sentinelFor(leaf, index, 'form')
          return (
            JSON.stringify(getPath(written, leaf.path)) !==
            JSON.stringify(expected)
          )
        })
        .map((leaf) => leaf.path)
      expect(wrong).toEqual([])
    })

    test('never writes an admin-owned field', () => {
      const written = editedFields(formData())
      const leaked = adminOwned.filter((path) => hasPath(written, path))
      expect(leaked).toEqual([])
    })

    test('never writes meta or timestamps', () => {
      // `meta.decided`/`meta.interview` are set by the decision actions and
      // `meta.submitted` by the applicant in the portal; a merge write that
      // echoed this dialog's snapshot back would revert a decision recorded
      // while it was open. `timestamps.created` would likewise be flattened.
      const written = editedFields(formData())
      expect(written.meta).toBeUndefined()
      expect(written.timestamps).toBeUndefined()
    })
  },
)

/**
 * EditRegistrationForm renders the parent's name but must never write it: the
 * dialog's `values` snapshot can be minutes stale, and the parent's name is
 * owned by the account profile in the portal.
 *
 * The form relies entirely on zod dropping unknown keys for this - it passes
 * `formVal.data.personal` straight through - so the guarantee lives in the
 * schema, not in `registrationEditedFields`. Pinned here because nothing in
 * the component states it, and a schema change that started allowing these
 * through would be silent.
 */
describe('registration parent-name handling', () => {
  const validPersonal = () => ({
    ...toRegistrationFormValues(createDefaultRegistrationValues()).personal,
    studentFirstName: 'Ada',
    studentLastName: 'Lovelace',
    email: 'ada@example.com',
    phoneNumber: '555-0100',
    dateOfBirth: '2010-01-01',
    gender: 'Female',
    frlp: 'No',
    parentEducation: 'College',
    parentFirstName: 'Annabella',
    parentLastName: 'Byron',
  })

  test('the form exposes the parent name for display', () => {
    // Guards the other half: if it stopped being exposed the stripping test
    // below would pass for the wrong reason.
    expect(validPersonal()).toMatchObject({
      parentFirstName: 'Annabella',
      parentLastName: 'Byron',
    })
  })

  test('zod strips the parent name before it can be written', () => {
    const parsed: any = registrationSchema.shape.personal.parse(validPersonal())
    expect(parsed).not.toHaveProperty('parentFirstName')
    expect(parsed).not.toHaveProperty('parentLastName')
    expect(parsed.studentFirstName).toBe('Ada')

    const written = registrationEditedFields({ personal: parsed })
    expect(written.personal).not.toHaveProperty('parentFirstName')
    expect(written.personal).not.toHaveProperty('parentLastName')
  })
})

/**
 * The two admin-only forms that have no stored document to map back from, so
 * they get the defaults half of the parity check and not the round-trip half.
 *
 * Their risk is the mirror image of the edit forms': there is no
 * `toXFormValues` allowlist to drift, but there is also no stored value to
 * fall back on. A schema field missing from the defaults factory starts out
 * `undefined` and is written that way on the very first save.
 */
describe.each([
  {
    label: 'create token',
    schema: tokenSchema as unknown as z.ZodTypeAny,
    getDefaults: getCreateTokenFormDefaults,
    expectedFields: ['role', 'consumable', 'expires'],
    // Pre-populated, so the dialog opens ready to submit as-is.
    expectedInvalidPaths: [] as string[],
  },
  {
    label: 'interview slot',
    schema: interviewSlotSchema as unknown as z.ZodTypeAny,
    getDefaults: () => getInterviewSlotDefaults(),
    expectedFields: [
      'date',
      'meetingLink',
      'interviewerName',
      'interviewerUid',
      'intervieweeFirstName',
      'intervieweeLastName',
      'intervieweeId',
      'interviewSlotStatus',
    ],
    // A blank slot form legitimately opens invalid: these four are the fields
    // the interviewer has to supply. Listing them is the point - if a fifth
    // appears, or one of the others stops having a usable default, that is a
    // change worth seeing.
    expectedInvalidPaths: ['date', 'meetingLink', 'interviewerName'],
  },
])(
  '$label defaults',
  ({ schema, getDefaults, expectedFields, expectedInvalidPaths }) => {
    const leaves = schemaLeaves(schema)

    test('the schema walker finds the expected field set', () => {
      // Spelled out rather than counted: these two schemas are small enough that
      // naming them makes a silent addition or removal obvious in the diff.
      expect(leaves.map((leaf) => leaf.path)).toEqual(expectedFields)
    })

    test.each(leaves)(
      'schema field $path has a default in the defaults factory',
      ({ path }) => {
        expect(hasPath(getDefaults(), path)).toBe(true)
      },
    )

    test('only the fields the user must supply fail validation', () => {
      // A default the schema rejects for any *other* reason is worse than a
      // missing one: the form opens invalid with nothing visibly wrong.
      const result = (schema as any).safeParse(getDefaults())
      const invalid = (result.error?.issues ?? []).map((issue: any) =>
        issue.path.join('.'),
      )
      expect([...new Set<string>(invalid)].sort()).toEqual(
        [...expectedInvalidPaths].sort(),
      )
    })
  },
)

/**
 * `getInterviewSlotDefaults` also carries `id`, which `interviewSlotSchema`
 * does not describe. That is deliberate - the id is generated at write time by
 * `generateInterviewSlotId` - but it means the slot defaults are the one place
 * where "not in the schema" is expected rather than a drift signal.
 */
test('interview slot defaults expose only id beyond the schema', () => {
  const validated = new Set(
    schemaLeaves(interviewSlotSchema as unknown as z.ZodTypeAny).map(
      (leaf) => leaf.path,
    ),
  )
  const extras = objectLeaves(getInterviewSlotDefaults()).filter(
    (path) => !validated.has(path),
  )
  expect(extras).toEqual(['id'])
})

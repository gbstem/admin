import {
  classDocId,
  interviewSlotDocId,
  isOwnClassId,
  isOwnRegistration,
  nextClassDocId,
  parseClassDocId,
  parseSubRequestDocId,
  registrationDocId,
  registrationParentUid,
  slotRequestDocId,
  slotRequestUid,
  subRequestDocId,
} from '$lib/data/docIds'

// A generated uid, and a seeded one containing `-` - the case that breaks any
// parser that splits on the first `-`.
const UID = 'Xk3pQ9aZ2mB7cD1eF4gH5iJ6kL8m'
const DASHED = 'instructor-demo-uid'

describe('class ids', () => {
  test.each([UID, DASHED])('round-trip for %s', (uid) => {
    expect(parseClassDocId(classDocId(uid, 3))).toEqual({
      instructorUid: uid,
      classNumber: 3,
    })
  })

  test('an id in another shape parses to null', () => {
    expect(parseClassDocId('class-python1')).toBeNull()
    expect(parseClassDocId(UID)).toBeNull()
  })

  test('isOwnClassId is exact', () => {
    expect(isOwnClassId(`${DASHED}-1`, DASHED)).toBe(true)
    // A shorter uid that merely prefixes the id owns nothing.
    expect(isOwnClassId(`${DASHED}-1`, 'instructor')).toBe(false)
    expect(isOwnClassId(`${UID}-0`, UID)).toBe(false)
    expect(isOwnClassId(`${UID}-01`, UID)).toBe(false)
    expect(isOwnClassId(`${UID}-1a`, UID)).toBe(false)
  })

  test("nextClassId numbers past the uid's highest class", () => {
    expect(nextClassDocId([], UID)).toBe(`${UID}-1`)
    expect(nextClassDocId([`${UID}-1`, `${UID}-4`, 'other-9'], UID)).toBe(
      `${UID}-5`,
    )
    // A dashed uid used to parse as NaN and restart at 1, over an existing class.
    expect(nextClassDocId([`${DASHED}-1`, `${DASHED}-2`], DASHED)).toBe(
      `${DASHED}-3`,
    )
    // Another account's classes don't count, even under a prefixing uid.
    expect(nextClassDocId([`${DASHED}-7`], 'instructor')).toBe('instructor-1')
  })
})

describe('registration ids', () => {
  test.each([UID, 'demo-parent-uid'])('round-trip for %s', (uid) => {
    expect(registrationParentUid(registrationDocId(uid, 2))).toBe(uid)
  })

  test('the plain `${parentUid}` form is its own parent', () => {
    expect(registrationParentUid(UID)).toBe(UID)
    expect(registrationParentUid('demo-parent-uid')).toBe('demo-parent-uid')
  })

  test('isOwnRegistration accepts only the uid and its numbered children', () => {
    expect(isOwnRegistration(UID, UID)).toBe(true)
    expect(isOwnRegistration(UID, registrationDocId(UID, 12))).toBe(true)
    expect(isOwnRegistration('parent', 'parent-uid-1')).toBe(false)
    expect(isOwnRegistration(UID, `${UID}-x`)).toBe(false)
    expect(isOwnRegistration(UID, `other-1`)).toBe(false)
  })
})

describe('sub request ids', () => {
  test.each([classDocId(UID, 2), classDocId(DASHED, 1), 'class-python1'])(
    'round-trip for class %s',
    (id) => {
      expect(parseSubRequestDocId(subRequestDocId(id, 4))).toEqual({
        classId: id,
        sessionNumber: 4,
      })
    },
  )

  test('an id in another shape parses to null', () => {
    expect(parseSubRequestDocId(classDocId(UID, 2))).toBeNull()
    expect(parseSubRequestDocId(`${UID}---`)).toBeNull()
  })
})

describe('interview time request ids', () => {
  test.each([UID, 'app-david'])('round-trip for %s', (uid) => {
    expect(slotRequestUid(slotRequestDocId(uid, '2030-01-15T10:00'))).toBe(uid)
  })

  test('an id in another shape parses to null', () => {
    expect(slotRequestUid(UID)).toBeNull()
  })
})

describe('interview slot ids', () => {
  test('are the start time in epoch ms followed by the interviewer uid', () => {
    const iso = '2026-05-28T10:00:00.000Z'
    expect(interviewSlotDocId(iso, UID)).toBe(`${Date.parse(iso)}${UID}`)
    expect(interviewSlotDocId(iso)).toBe(`${Date.parse(iso)}`)
  })
})

// Moved from the portal suites that tested these before they lived here.
describe('isOwnRegistration, more cases', () => {
  test("refuses anyone else's, including one that only shares a prefix", () => {
    expect(isOwnRegistration('parent-uid', 'other-uid-1')).toBe(false)
    expect(isOwnRegistration('parent-uid', 'parent-uid-1-2')).toBe(false)
    expect(isOwnRegistration('parent-uid', 'parent-uid-x')).toBe(false)
    expect(isOwnRegistration('parent-uid', 'parent-uid-')).toBe(false)
  })
})

describe('isOwnClassId, more cases', () => {
  test('matches exactly `${uid}-${n}` with n a positive integer', () => {
    expect(isOwnClassId('uid-1-1', 'uid-1')).toBe(true)
    expect(isOwnClassId('uid-1-12', 'uid-1')).toBe(true)
    expect(isOwnClassId('uid-1', 'uid-1')).toBe(false)
    expect(isOwnClassId('uid-1_1', 'uid-1')).toBe(false)
    expect(isOwnClassId('other-1', 'uid-1')).toBe(false)
  })

  test('treats regex characters in a uid literally', () => {
    expect(isOwnClassId('a.b-1', 'a.b')).toBe(true)
    expect(isOwnClassId('axb-1', 'a.b')).toBe(false)
  })
})

describe('sub request ids, more cases', () => {
  // A uid contains single dashes, which is why the separator is three of them
  // and why splitting on the first dash would be wrong.
  test('recovers the class from ids that already exist', () => {
    expect(parseSubRequestDocId('instructor-demo-uid-1---12')).toEqual({
      classId: 'instructor-demo-uid-1',
      sessionNumber: 12,
    })
    expect(subRequestDocId('owner-uid-1', 3)).toBe('owner-uid-1---3')
  })
})

import {
  classIdFromSubRequestId,
  decideEmailStrip,
  describeUnresolved,
  interviewSlotEmailFields,
  needsEmailFieldWork,
  normalizeEmail,
  storedUid,
  uidFromSlotRequestId,
} from '../scripts/lib/emailToUidTransforms'

describe('normalizeEmail', () => {
  test('trims and lowercases an address', () => {
    expect(normalizeEmail('  Interviewer@Example.COM  ')).toBe(
      'interviewer@example.com',
    )
  })

  test('is null for a missing, blank, or non-string value', () => {
    expect(normalizeEmail(undefined)).toBe(null)
    expect(normalizeEmail(null)).toBe(null)
    expect(normalizeEmail('   \t\n  ')).toBe(null)
    expect(normalizeEmail(12345)).toBe(null)
    expect(normalizeEmail(['a@b.com'])).toBe(null)
  })
})

describe('storedUid', () => {
  test('returns a stamped uid, trimmed', () => {
    expect(storedUid({ interviewerUid: ' uid-ada ' }, 'interviewerUid')).toBe(
      'uid-ada',
    )
  })

  // Several write paths default a uid field to '', which names nobody.
  test('is null for a missing, blank, or non-string field', () => {
    expect(storedUid({}, 'interviewerUid')).toBe(null)
    expect(storedUid({ interviewerUid: '' }, 'interviewerUid')).toBe(null)
    expect(storedUid({ interviewerUid: '   ' }, 'interviewerUid')).toBe(null)
    expect(storedUid({ interviewerUid: null }, 'interviewerUid')).toBe(null)
    expect(storedUid({ interviewerUid: 12345 }, 'interviewerUid')).toBe(null)
  })
})

describe('needsEmailFieldWork', () => {
  const keep = { stripEmails: false }
  const strip = { stripEmails: true }

  test('picks up an address with no uid beside it', () => {
    expect(
      needsEmailFieldWork(
        { interviewerEmail: 'a@b.com', interviewerUid: '' },
        interviewSlotEmailFields,
        keep,
      ),
    ).toBe(true)
  })

  test('checks every pair, not just the first', () => {
    expect(
      needsEmailFieldWork(
        {
          interviewerEmail: 'a@b.com',
          interviewerUid: 'uid-a',
          intervieweeEmail: 'c@d.com',
          intervieweeId: '',
        },
        interviewSlotEmailFields,
        keep,
      ),
    ).toBe(true)
  })

  // An unbooked slot: no interviewee and no address for one.
  test('skips pairs already backed by a uid, or with no address', () => {
    expect(
      needsEmailFieldWork(
        {
          interviewerEmail: 'a@b.com',
          interviewerUid: 'uid-a',
          intervieweeEmail: '',
          intervieweeId: '',
        },
        interviewSlotEmailFields,
        keep,
      ),
    ).toBe(false)
  })

  // Stripping exists to remove the field, so even a blank one needs a write.
  test('when stripping, picks up any address field that is still there', () => {
    expect(
      needsEmailFieldWork(
        { interviewerUid: 'uid-a', intervieweeEmail: '' },
        interviewSlotEmailFields,
        strip,
      ),
    ).toBe(true)
  })

  test('when stripping, skips a document with no address fields left', () => {
    expect(
      needsEmailFieldWork(
        { interviewerUid: 'uid-a', intervieweeId: '' },
        interviewSlotEmailFields,
        strip,
      ),
    ).toBe(false)
  })
})

describe('decideEmailStrip', () => {
  const keepUnresolved = { stripUnresolved: false }
  const stripUnresolved = { stripUnresolved: true }
  const data = { interviewerEmail: 'a@b.com' }

  test('does nothing when the field is already gone', () => {
    expect(
      decideEmailStrip({}, 'interviewerEmail', 'live', keepUnresolved),
    ).toBe('none')
  })

  test('strips an address a live account uid backs', () => {
    expect(
      decideEmailStrip(data, 'interviewerEmail', 'live', keepUnresolved),
    ).toBe('strip')
  })

  // Blank addresses record nobody, so there is nothing to lose.
  test('strips a blank address whatever backs it', () => {
    expect(
      decideEmailStrip(
        { interviewerEmail: '  ' },
        'interviewerEmail',
        'missing',
        keepUnresolved,
      ),
    ).toBe('strip')
  })

  // The address is then the only record of who the document belonged to.
  test('keeps an address with no uid, or whose uid names no account', () => {
    expect(
      decideEmailStrip(data, 'interviewerEmail', 'missing', keepUnresolved),
    ).toBe('keep')
    expect(
      decideEmailStrip(data, 'interviewerEmail', 'no account', keepUnresolved),
    ).toBe('keep')
  })

  test('strips unresolved addresses only when told to', () => {
    expect(
      decideEmailStrip(data, 'interviewerEmail', 'missing', stripUnresolved),
    ).toBe('strip')
    expect(
      decideEmailStrip(data, 'interviewerEmail', 'no account', stripUnresolved),
    ).toBe('strip')
  })
})

describe('classIdFromSubRequestId', () => {
  test('returns the class ID before the ---', () => {
    expect(classIdFromSubRequestId('abc123XYZ-2---4')).toBe('abc123XYZ-2')
  })

  test('is null when there is no class ID to find', () => {
    expect(classIdFromSubRequestId('sub-req-fake-3')).toBe(null)
    expect(classIdFromSubRequestId('---4')).toBe(null)
  })
})

describe('uidFromSlotRequestId', () => {
  test('returns the uid before the requested date', () => {
    expect(uidFromSlotRequestId('abc123XYZ-2026-09-12T14:00')).toBe('abc123XYZ')
    expect(uidFromSlotRequestId('abc123XYZ-2026-09-12')).toBe('abc123XYZ')
  })

  // Explicitly set uids may contain hyphens (the seed's all do), so this has
  // to find the date rather than split at the first hyphen.
  test('keeps a hyphenated uid intact', () => {
    expect(uidFromSlotRequestId('instructor-demo-uid-2026-09-12T14:00')).toBe(
      'instructor-demo-uid',
    )
  })

  test('is null when no date follows', () => {
    expect(uidFromSlotRequestId('abc123XYZ')).toBe(null)
    expect(uidFromSlotRequestId('2026-09-12')).toBe(null)
  })
})

describe('describeUnresolved', () => {
  const unresolved = {
    email: 'gone@example.com',
    unresolved: 'no account for gone@example.com',
    strip: false,
  }

  test('says no uid was stamped when only backfilling', () => {
    expect(
      describeUnresolved('Fall25/slot-1', 'interviewerEmail', unresolved, {
        stripEmails: false,
      }),
    ).toBe(
      'UNRESOLVED Fall25/slot-1 interviewerEmail "gone@example.com": ' +
        'no account for gone@example.com; no uid stamped',
    )
  })

  test('says whether stripping kept or removed the address', () => {
    expect(
      describeUnresolved('x', 'interviewerEmail', unresolved, {
        stripEmails: true,
      }),
    ).toMatch(/; kept$/)
    expect(
      describeUnresolved(
        'x',
        'interviewerEmail',
        { ...unresolved, strip: true },
        { stripEmails: true },
      ),
    ).toMatch(/; removed anyway \(--strip-unresolved\)$/)
  })

  test('flags nothing that is resolved, or that has no address', () => {
    expect(
      describeUnresolved(
        'x',
        'interviewerEmail',
        { email: 'a@b.com', strip: true },
        { stripEmails: true },
      ),
    ).toBe(null)
    expect(
      describeUnresolved(
        'x',
        'instructorEmail',
        { email: null, unresolved: 'no uid prefix', strip: false },
        { stripEmails: false },
      ),
    ).toBe(null)
  })
})

/**
 * @jest-environment node
 */
const mockSaveApplicationEdits = jest.fn()
const mockSaveRegistrationEdits = jest.fn()
const mockSetBypassAgeLimits = jest.fn()
const mockSaveClassEdits = jest.fn()
const mockCreateToken = jest.fn()

jest.mock('$lib/server/applicationService', () => ({
  applicationService: {
    saveApplicationEdits: (...args: any[]) => mockSaveApplicationEdits(...args),
  },
}))

jest.mock('$lib/server/registrationService', () => ({
  registrationService: {
    saveRegistrationEdits: (...args: any[]) =>
      mockSaveRegistrationEdits(...args),
    setBypassAgeLimits: (...args: any[]) => mockSetBypassAgeLimits(...args),
  },
}))

jest.mock('$lib/server/classService', () => ({
  classService: {
    saveClassEdits: (...args: any[]) => mockSaveClassEdits(...args),
  },
}))

jest.mock('$lib/server/tokenService', () => ({
  tokenService: {
    createToken: (...args: any[]) => mockCreateToken(...args),
  },
}))

import {
  CREATE_TOKEN_FORM_ID,
  EDIT_APPLICATION_FORM_ID,
  EDIT_CLASS_FORM_ID,
  EDIT_REGISTRATION_FORM_ID,
} from '$lib/components/forms/schemas'
import { currentSemester } from '$lib/data/collections'
import { actions as applicationsActions } from '../src/routes/(signedIn)/(emailVerified)/applications/+page.server'
import { actions as classesActions } from '../src/routes/(signedIn)/(emailVerified)/classes/+page.server'
import { actions as tokensActions } from '../src/routes/(signedIn)/(emailVerified)/tokens/+page.server'
import { actions as registrationsActions } from '../src/routes/(signedIn)/(emailVerified)/registrations/+page.server'
import { stringify } from 'devalue'

const admin = {
  uid: 'admin-1',
  email: 'a@test.com',
  role: 'admin',
  emailVerified: true,
}
const reviewer = {
  uid: 'rev-1',
  email: 'r@test.com',
  role: 'reviewer',
  emailVerified: true,
}

/** A request shaped the way superforms' `dataType: 'json'` posts a form. */
function superformRequest(id: string, data: unknown) {
  const body = new FormData()
  body.set('__superform_id', id)
  body.set('__superform_json', stringify(data))
  return new Request('http://localhost/', { method: 'POST', body })
}

function validApplication() {
  return {
    personal: {
      phoneNumber: '5551234567',
      dateOfBirth: '2005-01-01',
      gender: 'Female',
      race: [],
    },
    academic: { school: 'MIT', graduationYear: new Date().getFullYear() },
    program: {
      courses: ['Python 1'],
      preferences: '',
      timeSlots: 'Weekends',
      notAvailable: 'None',
      inPerson: false,
      reason: 'School',
    },
    essay: {
      taughtBefore: true,
      academicBackground: 'CS',
      teachingScenario: '',
      why: '',
    },
    agreements: { entireProgram: true, timeCommitment: true, submitting: true },
  }
}

describe('/applications?/saveApplication', () => {
  const url = new URL(
    `http://localhost/applications?/saveApplication&id=uid-1&semester=${currentSemester}`,
  )
  const save = (user: unknown, data: unknown, at = url) =>
    (applicationsActions.saveApplication as any)({
      request: superformRequest(EDIT_APPLICATION_FORM_ID, data),
      locals: { user },
      url: at,
    })

  beforeEach(() => {
    mockSaveApplicationEdits.mockReset().mockResolvedValue(undefined)
  })

  it.each([
    ['an admin', admin],
    ['a reviewer', reviewer],
  ])('saves the validated form for %s', async (_, user) => {
    const result = await save(user, validApplication())

    expect(result.form.valid).toBe(true)
    expect(result.form.message).toBe('Changes were saved successfully.')
    expect(mockSaveApplicationEdits).toHaveBeenCalledWith(
      currentSemester,
      'uid-1',
      validApplication(),
    )
  })

  it('refuses an invalid form with its errors, writing nothing', async () => {
    const data = validApplication()
    data.personal.phoneNumber = 'not a phone'

    const result = await save(admin, data)

    expect(result.status).toBe(400)
    expect(result.data.form.errors.personal.phoneNumber).toBeDefined()
    expect(mockSaveApplicationEdits).not.toHaveBeenCalled()
  })

  it('refuses a signed-out caller', async () => {
    await expect(save(null, validApplication())).rejects.toMatchObject({
      status: 401,
    })
    expect(mockSaveApplicationEdits).not.toHaveBeenCalled()
  })

  it('refuses an unknown semester rather than writing to the current one', async () => {
    const at = new URL(
      'http://localhost/applications?/saveApplication&id=uid-1&semester=Nope99',
    )
    await expect(save(admin, validApplication(), at)).rejects.toMatchObject({
      status: 400,
    })
    expect(mockSaveApplicationEdits).not.toHaveBeenCalled()
  })
})

describe('/registrations?/saveRegistration', () => {
  const url = new URL(
    `http://localhost/registrations?/saveRegistration&id=uid-1-1&semester=${currentSemester}`,
  )
  const save = (user: unknown, data: unknown) =>
    (registrationsActions.saveRegistration as any)({
      request: superformRequest(EDIT_REGISTRATION_FORM_ID, data),
      locals: { user },
      url,
    })

  function validRegistration() {
    return {
      personal: {
        studentFirstName: 'Sally',
        studentLastName: 'Brown',
        secondaryEmail: '',
        phoneNumber: '5551234567',
        dateOfBirth: '2015-01-01',
        gender: 'Female',
        race: [],
        frlp: 'No',
        parentEducation: 'College',
      },
      academic: { school: 'Riverdale', grade: '3' },
      program: {
        csCourse: '',
        mathCourse: '',
        engineeringCourse: '',
        scienceCourse: '',
        inPerson: false,
        reason: '',
      },
      inPerson: { allergies: '', parentPickup: '' },
      // Unchecked on purpose: an admin may record a withdrawn attestation.
      agreements: {
        mediaRelease: false,
        bypassAgeLimits: false,
        entireProgram: false,
        timeCommitment: false,
        submitting: false,
      },
    }
  }

  beforeEach(() => {
    mockSaveRegistrationEdits.mockReset().mockResolvedValue(undefined)
  })

  it('saves the validated form for an admin', async () => {
    const result = await save(admin, validRegistration())

    expect(result.form.valid).toBe(true)
    expect(mockSaveRegistrationEdits).toHaveBeenCalledWith(
      currentSemester,
      'uid-1-1',
      validRegistration(),
    )
  })

  it('refuses a reviewer, as firestore.rules does', async () => {
    await expect(save(reviewer, validRegistration())).rejects.toMatchObject({
      status: 403,
    })
    expect(mockSaveRegistrationEdits).not.toHaveBeenCalled()
  })

  it('refuses an invalid form with its errors, writing nothing', async () => {
    const data = validRegistration()
    data.personal.studentFirstName = ''

    const result = await save(admin, data)

    expect(result.status).toBe(400)
    expect(result.data.form.errors.personal.studentFirstName).toBeDefined()
    expect(mockSaveRegistrationEdits).not.toHaveBeenCalled()
  })
})

describe('/registrations?/setBypassAgeLimits', () => {
  const at = (semester = currentSemester) =>
    new URL(
      `http://localhost/registrations?/setBypassAgeLimits&id=uid-1-1&semester=${semester}`,
    )
  const set = (user: unknown, value: string | null, url = at()) => {
    const body = new FormData()
    if (value !== null) body.set('bypassAgeLimits', value)
    return (registrationsActions.setBypassAgeLimits as any)({
      request: new Request('http://localhost/', { method: 'POST', body }),
      locals: { user },
      url,
    })
  }

  beforeEach(() => {
    mockSetBypassAgeLimits.mockReset().mockResolvedValue(undefined)
  })

  it.each([
    ['true', true],
    ['false', false],
  ])('sets the flag to %s for an admin', async (value, expected) => {
    await expect(set(admin, value)).resolves.toEqual({
      bypassAgeLimits: expected,
    })
    expect(mockSetBypassAgeLimits).toHaveBeenCalledWith(
      currentSemester,
      'uid-1-1',
      expected,
    )
  })

  it('refuses a reviewer, as firestore.rules does', async () => {
    await expect(set(reviewer, 'true')).rejects.toMatchObject({ status: 403 })
    expect(mockSetBypassAgeLimits).not.toHaveBeenCalled()
  })

  it.each([null, '', 'yes'])(
    'refuses a missing or non-boolean value (%s)',
    async (value) => {
      await expect(set(admin, value)).rejects.toMatchObject({ status: 400 })
      expect(mockSetBypassAgeLimits).not.toHaveBeenCalled()
    },
  )

  it('refuses an unknown semester', async () => {
    await expect(set(admin, 'true', at('Nope99'))).rejects.toMatchObject({
      status: 400,
    })
    expect(mockSetBypassAgeLimits).not.toHaveBeenCalled()
  })
})

describe('/classes?/saveClass', () => {
  const url = new URL(
    `http://localhost/classes?/saveClass&id=inst-uid-1&semester=${currentSemester}`,
  )
  const save = (user: unknown, data: unknown, at = url) =>
    (classesActions.saveClass as any)({
      request: superformRequest(EDIT_CLASS_FORM_ID, data),
      locals: { user },
      url: at,
    })

  function validClass() {
    return {
      course: 'Python 1',
      gradeRecommendation: '3-5',
      classCap: 12,
      meetingLink: 'https://mit.zoom.us/j/99593863281',
      classDay1: 'Monday',
      classTime1: '16:00',
      classDay2: 'Wednesday',
      classTime2: '16:00',
      online: true,
    }
  }

  beforeEach(() => {
    mockSaveClassEdits.mockReset().mockResolvedValue(undefined)
  })

  it.each([
    ['an admin', admin],
    ['a reviewer', reviewer],
  ])('saves the validated form for %s', async (_, user) => {
    const result = await save(user, validClass())

    expect(result.form.valid).toBe(true)
    expect(result.form.message).toBe('Changes were saved successfully.')
    expect(mockSaveClassEdits).toHaveBeenCalledWith(
      currentSemester,
      'inst-uid-1',
      validClass(),
    )
  })

  it('refuses an online class with no meeting link, writing nothing', async () => {
    const result = await save(admin, { ...validClass(), meetingLink: '' })

    expect(result.status).toBe(400)
    expect(result.data.form.errors.meetingLink).toBeDefined()
    expect(mockSaveClassEdits).not.toHaveBeenCalled()
  })

  it.each([
    ['a signed-out caller', null, 401],
    [
      'an instructor',
      { uid: 'inst-uid', role: 'instructor', emailVerified: true },
      403,
    ],
  ])('refuses %s', async (_, user, status) => {
    await expect(save(user, validClass())).rejects.toMatchObject({ status })
    expect(mockSaveClassEdits).not.toHaveBeenCalled()
  })

  it('refuses an unknown semester rather than writing to the current one', async () => {
    const at = new URL(
      'http://localhost/classes?/saveClass&id=inst-uid-1&semester=Nope99',
    )
    await expect(save(admin, validClass(), at)).rejects.toMatchObject({
      status: 400,
    })
    expect(mockSaveClassEdits).not.toHaveBeenCalled()
  })

  it('refuses an id that addresses another path', async () => {
    const at = new URL(
      `http://localhost/classes?/saveClass&id=a/b/c&semester=${currentSemester}`,
    )
    await expect(save(admin, validClass(), at)).rejects.toMatchObject({
      status: 400,
    })
    expect(mockSaveClassEdits).not.toHaveBeenCalled()
  })
})

describe('/tokens?/createToken', () => {
  const create = (user: unknown, data: unknown) =>
    (tokensActions.createToken as any)({
      request: superformRequest(CREATE_TOKEN_FORM_ID, data),
      locals: { user },
    })
  const validToken = { role: 'reviewer', consumable: true, expires: 24 }

  beforeEach(() => {
    mockCreateToken.mockReset().mockResolvedValue('tok-1')
  })

  it('creates the token for an admin and returns its id for the signup link', async () => {
    const result = await create(admin, validToken)

    expect(result.form.valid).toBe(true)
    expect(result.tokenId).toBe('tok-1')
    expect(mockCreateToken).toHaveBeenCalledWith(validToken)
  })

  it.each([
    [
      'a role tokens cannot grant',
      { ...validToken, role: 'instructor' },
      'role',
    ],
    ['an expiry past 48 hours', { ...validToken, expires: 72 }, 'expires'],
  ])('refuses %s, creating nothing', async (_, data, field) => {
    const result = await create(admin, data)

    expect(result.status).toBe(400)
    expect(result.data.form.errors[field]).toBeDefined()
    expect(mockCreateToken).not.toHaveBeenCalled()
  })

  it.each([
    ['a signed-out caller', null, 401],
    // A reviewer could otherwise mint themselves an admin account.
    ['a reviewer', reviewer, 403],
  ])('refuses %s', async (_, user, status) => {
    await expect(create(user, validToken)).rejects.toMatchObject({ status })
    expect(mockCreateToken).not.toHaveBeenCalled()
  })
})

/**
 * @jest-environment node
 */
const mockSaveApplicationEdits = jest.fn()
const mockSaveRegistrationEdits = jest.fn()
const mockSetBypassAgeLimits = jest.fn()

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

import {
  EDIT_APPLICATION_FORM_ID,
  EDIT_REGISTRATION_FORM_ID,
} from '$lib/components/forms/schemas'
import { currentSemester } from '$lib/data/collections'
import { actions as applicationsActions } from '../src/routes/(signedIn)/(emailVerified)/applications/+page.server'
import { actions as registrationsActions } from '../src/routes/(signedIn)/(emailVerified)/registrations/+page.server'
import { stringify } from 'devalue'

const admin = { uid: 'admin-1', email: 'a@test.com', role: 'admin' }
const reviewer = { uid: 'rev-1', email: 'r@test.com', role: 'reviewer' }

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

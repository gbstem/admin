import type {} from '../../data.d.ts'
import { type Timestamp, serverTimestamp } from 'firebase/firestore'
import type { RegistrationEditableFields } from '../services/registrationService'

/**
 * Returns clean default empty Data.Registration state.
 *
 * Lifted out of Registration.svelte so the parity test can check it against
 * `registrationSchema`: a schema field with no home here starts out
 * `undefined`, which `toRegistrationFormValues` then reads as empty.
 */
export function createDefaultRegistrationValues(): Data.Registration<'client'> {
  return {
    personal: {
      email: '',
      studentFirstName: '',
      studentLastName: '',
      parentFirstName: '',
      parentLastName: '',
      gender: '',
      race: [],
      phoneNumber: '',
      dateOfBirth: '',
      frlp: '',
      parentEducation: '',
      secondaryEmail: '',
    },
    academic: {
      school: '',
      grade: '',
    },
    program: {
      csCourse: '',
      engineeringCourse: '',
      mathCourse: '',
      scienceCourse: '',
      inPerson: false,
      reason: '',
    },
    inPerson: {
      allergies: '',
      parentPickup: '',
    },
    agreements: {
      mediaRelease: false,
      bypassAgeLimits: false,
      entireProgram: false,
      timeCommitment: false,
      submitting: false,
    },
    meta: {
      uid: '',
      submitted: false,
    },
    timestamps: {
      created: serverTimestamp() as Timestamp,
      updated: serverTimestamp() as Timestamp,
    },
  }
}

/**
 * Maps a stored registration into superform-compatible values.
 *
 * See `toApplicationFormValues` for why a field missing from this allowlist is
 * both invisible and destructive.
 *
 * `parentFirstName`/`parentLastName` are deliberately here without being in
 * `registrationSchema`: the form displays them but zod strips them from the
 * validated data, so they are never written back.
 */
export function toRegistrationFormValues(v: Data.Registration<'client'>) {
  return {
    personal: {
      studentFirstName: v.personal?.studentFirstName || '',
      studentLastName: v.personal?.studentLastName || '',
      parentFirstName: v.personal?.parentFirstName || '',
      parentLastName: v.personal?.parentLastName || '',
      secondaryEmail: v.personal?.secondaryEmail || '',
      phoneNumber: v.personal?.phoneNumber || '',
      dateOfBirth: v.personal?.dateOfBirth || '',
      gender: v.personal?.gender || '',
      race: v.personal?.race || [],
      frlp: v.personal?.frlp || '',
      parentEducation: v.personal?.parentEducation || '',
    },
    academic: {
      school: v.academic?.school || '',
      grade: v.academic?.grade || '',
    },
    program: {
      csCourse: v.program?.csCourse || '',
      mathCourse: v.program?.mathCourse || '',
      engineeringCourse: v.program?.engineeringCourse || '',
      scienceCourse: v.program?.scienceCourse || '',
      inPerson: v.program?.inPerson !== undefined ? v.program.inPerson : false,
      reason: v.program?.reason || '',
    },
    inPerson: {
      allergies: v.inPerson?.allergies || '',
      parentPickup: v.inPerson?.parentPickup || '',
    },
    agreements: {
      mediaRelease:
        v.agreements?.mediaRelease !== undefined
          ? v.agreements.mediaRelease
          : false,
      bypassAgeLimits:
        v.agreements?.bypassAgeLimits !== undefined
          ? v.agreements.bypassAgeLimits
          : false,
      entireProgram:
        v.agreements?.entireProgram !== undefined
          ? v.agreements.entireProgram
          : false,
      timeCommitment:
        v.agreements?.timeCommitment !== undefined
          ? v.agreements.timeCommitment
          : false,
      submitting:
        v.agreements?.submitting !== undefined
          ? v.agreements.submitting
          : false,
    },
  }
}

/**
 * Fields the *portal's* registration form owns, which admin may still edit.
 *
 * Empty on purpose, and not a copy-paste of portal's list: admin is the side
 * that owns `agreements.bypassAgeLimits`, so unlike the portal form this one
 * is allowed to write it. Kept as a named constant so the parity test states
 * that intent rather than leaving it implied.
 */
export const REGISTRATION_ADMIN_OWNED_FIELDS: string[] = []

/**
 * What this form is allowed to write, ready for a `{ merge: true }` write.
 *
 * The validated form data only - see `applicationEditedFields` for why the
 * snapshot is not merged back in. `parentFirstName`/`parentLastName` are
 * absent because zod strips them, which is what keeps this form from
 * overwriting the parent's name with a stale copy.
 */
export function registrationEditedFields(
  formData: any,
): RegistrationEditableFields {
  return {
    personal: formData.personal,
    academic: formData.academic,
    program: formData.program,
    inPerson: formData.inPerson,
    agreements: formData.agreements,
  }
}

/**
 * The component's local `values`/`dbValues` after a successful save. Describes
 * the whole document for redisplay and never reaches Firestore.
 */
export function registrationDisplayValues(
  values: Data.Registration<'client'>,
  formData: any,
): Data.Registration<'client'> {
  return {
    ...values,
    personal: { ...values.personal, ...formData.personal },
    academic: { ...values.academic, ...formData.academic },
    program: { ...values.program, ...formData.program },
    inPerson: { ...values.inPerson, ...formData.inPerson },
    agreements: { ...values.agreements, ...formData.agreements },
  }
}

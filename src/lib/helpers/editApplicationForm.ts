import type {} from '../../data.d.ts'

/**
 * The field groups the admin edit form owns, each `Partial` because the write is a
 * merge: the form sends only the sub-fields it renders, and Firestore merges nested
 * maps key by key. Sub-fields it deliberately doesn't render - `personal.firstName`,
 * `lastName` and `email`, which the applicant changes from their portal profile, and
 * `program.numClasses` - are therefore left untouched instead of being rewritten from
 * the dialog's stale snapshot.
 */
export type ApplicationEditableFields = {
  [K in 'personal' | 'academic' | 'program' | 'essay' | 'agreements']: Partial<
    Data.Application<'client'>[K]
  >
}

/**
 * Maps a stored application into superform-compatible values.
 *
 * Lifted out of EditApplicationForm so `formFieldParity.test.ts` can reach it.
 * This allowlist sits on both the read and the display side, so a schema field
 * missing from it is invisible twice over: the form shows the schema's default
 * instead of the stored value, and because the save writes the validated form
 * data straight back, that default then overwrites what was stored. Nothing
 * about the UI looks wrong while it happens.
 */
export function toApplicationFormValues(v: Data.Application<'client'>) {
  return {
    personal: {
      phoneNumber: v.personal?.phoneNumber || '',
      dateOfBirth: v.personal?.dateOfBirth || '',
      gender: v.personal?.gender || '',
      race: v.personal?.race || [],
    },
    academic: {
      school: v.academic?.school || '',
      graduationYear: v.academic?.graduationYear || new Date().getFullYear(),
    },
    program: {
      courses: v.program?.courses || [],
      preferences: v.program?.preferences || '',
      timeSlots: v.program?.timeSlots || '',
      notAvailable: v.program?.notAvailable || '',
      inPerson: v.program?.inPerson !== undefined ? v.program.inPerson : false,
      reason: v.program?.reason || '',
    },
    essay: {
      taughtBefore:
        v.essay?.taughtBefore !== undefined ? v.essay.taughtBefore : false,
      academicBackground: v.essay?.academicBackground || '',
      teachingScenario: v.essay?.teachingScenario || '',
      why: v.essay?.why || '',
    },
    agreements: {
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
 * Fields inside the application document that this form must never write.
 *
 * `meta` is the whole of it - `meta.decided`/`meta.interview`/`meta.submitted`
 * are owned by the decision actions and by the applicant's own submit in the
 * portal. `applicationEditedFields` omits it wholesale rather than field by
 * field, so this list stays empty unless a *nested* admin-owned field appears
 * inside one of the five groups below.
 */
export const APPLICATION_ADMIN_OWNED_FIELDS: string[] = []

/**
 * What this form is allowed to write, ready for a `{ merge: true }` write.
 *
 * Deliberately the *validated* form data rather than a re-merge of `values`:
 * `values` is the snapshot taken when the dialog opened, so merging it back in
 * would rewrite fields this form only displays (name, email) with whatever
 * they happened to be at open time, clobbering any concurrent edit.
 *
 * Everything omitted here keeps whatever the last writer left, which is what
 * makes `meta` and `timestamps` safe to leave out entirely.
 */
export function applicationEditedFields(
  formData: any,
): ApplicationEditableFields {
  return {
    personal: formData.personal,
    academic: formData.academic,
    program: formData.program,
    essay: formData.essay,
    agreements: formData.agreements,
  }
}

/**
 * The component's local `values`/`dbValues` after a successful save.
 *
 * Unlike `applicationEditedFields` this *does* merge the snapshot, because it
 * has to describe the whole document for redisplay - including the fields the
 * form only shows. It never reaches Firestore.
 */
export function applicationDisplayValues(
  values: Data.Application<'client'>,
  formData: any,
): Data.Application<'client'> {
  return {
    ...values,
    personal: { ...values.personal, ...formData.personal },
    academic: { ...values.academic, ...formData.academic },
    program: { ...values.program, ...formData.program },
    essay: { ...values.essay, ...formData.essay },
    agreements: { ...values.agreements, ...formData.agreements },
  }
}

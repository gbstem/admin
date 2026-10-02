import {
  classesCollection,
  registrationsCollection,
} from '$lib/data/collections'
import { adminDb } from '$lib/server/firebase'
import { error } from '@sveltejs/kit'

/** A registration with the enrollment fields its type doesn't declare. */
type EnrolledRegistration = Data.Registration<'server'> & {
  classes?: string[]
  enrolled?: boolean
}

/** The class and registration as an enrollment left them. */
export interface Enrollment {
  classData: Data.Class
  registration: EnrolledRegistration
}

function refs(classId: string, registrationId: string) {
  return {
    classRef: adminDb.doc(`${classesCollection}/${classId}`),
    registrationRef: adminDb.doc(
      `${registrationsCollection}/${registrationId}`,
    ),
  }
}

/**
 * Enrolls a student in a class on an admin's say-so: adds them to the class's
 * `students` and the class to their registration's `classes`, in one
 * transaction, since the roster, capacity and reminders read one side and the
 * family's view reads the other.
 *
 * Unlike portal's parent-facing `enrollStudent`, this makes no capacity,
 * grade or class-count checks: an admin may override all of them. Refused
 * only when either document is missing. Idempotent, so it also completes a
 * half-finished enrollment.
 */
export async function enrollStudent(
  classId: string,
  registrationId: string,
): Promise<Enrollment> {
  const { classRef, registrationRef } = refs(classId, registrationId)
  return adminDb.runTransaction(async (transaction) => {
    const classSnap = await transaction.get(classRef)
    const registrationSnap = await transaction.get(registrationRef)
    if (!registrationSnap.exists) {
      throw error(404, 'That student has no registration.')
    }
    if (!classSnap.exists) {
      throw error(404, 'That class no longer exists.')
    }
    const classData = classSnap.data() as Data.Class
    const registration = registrationSnap.data() as EnrolledRegistration

    const students = classData.students ?? []
    const classIds = registration.classes ?? []
    const enrolledStudents = students.includes(registrationId)
      ? students
      : [...students, registrationId]
    const enrolledClassIds = classIds.includes(classId)
      ? classIds
      : [...classIds, classId]
    transaction.update(classRef, { students: enrolledStudents })
    transaction.update(registrationRef, {
      classes: enrolledClassIds,
      enrolled: true,
    })

    return {
      classData: { ...classData, students: enrolledStudents },
      registration: {
        ...registration,
        classes: enrolledClassIds,
        enrolled: true,
      },
    }
  })
}

/**
 * Takes a student out of a class, from both the class's `students` and their
 * registration's `classes`, in one transaction; `enrolled` then says whether
 * any class is left. Idempotent, so a half-finished enrollment can always be
 * undone. Refused only when the registration is missing; a deleted class just
 * leaves the registration side to clear.
 */
export async function dropStudent(
  classId: string,
  registrationId: string,
): Promise<void> {
  const { classRef, registrationRef } = refs(classId, registrationId)
  await adminDb.runTransaction(async (transaction) => {
    const classSnap = await transaction.get(classRef)
    const registrationSnap = await transaction.get(registrationRef)
    if (!registrationSnap.exists) {
      throw error(404, 'That student has no registration.')
    }
    const remainingClasses = (
      (registrationSnap.data() as EnrolledRegistration).classes ?? []
    ).filter((id) => id !== classId)
    if (classSnap.exists) {
      const students = (classSnap.data() as Data.Class).students ?? []
      transaction.update(classRef, {
        students: students.filter((id) => id !== registrationId),
      })
    }
    transaction.update(registrationRef, {
      classes: remainingClasses,
      enrolled: remainingClasses.length > 0,
    })
  })
}

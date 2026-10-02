import { db } from '$lib/client/firebase'
import { studentService } from '$lib/services/studentService'
import {
  classesCollection,
  instructorFeedbackCollection,
  registrationsCollection,
} from '$lib/data/collections'
import type ClassData from '$lib/data/types/ClassData'
import type Student from '$lib/data/types/Student'
import { normalizeCapitals, timestampToDate } from '$lib/utils'
import { doc, getDoc } from 'firebase/firestore'
import type {
  ClassStatusesRequestBody,
  ClassStatusesResponse,
} from '../../routes/api/classStatuses/+server'

export interface ClientInstructorFeedback {
  courseName: string
  instructorName: string
  feedback: string
  date: string
  classNumber: number
  attendanceList: Record<string, { present: boolean }>
  id: string
  students: string[]
}

/** A server error's message, or the status text when the body isn't JSON. */
async function errorMessage(res: Response): Promise<string> {
  try {
    return (await res.json()).message ?? res.statusText
  } catch {
    return res.statusText
  }
}

/**
 * Service providing Data Access Layer for Admin Class operations.
 */
export const classService = {
  /**
   * Fetches a single class document by ID and normalizes meeting times.
   */
  async fetchClassData(classId: string): Promise<ClassData | null> {
    const snap = await getDoc(doc(db, classesCollection, classId))
    if (!snap.exists()) {
      return null
    }

    const data = snap.data() as ClassData
    data.meetingTimes = (data.meetingTimes || [])
      .map((t) => timestampToDate(t))
      .sort((a: Date, b: Date) => a.getTime() - b.getTime())

    return data
  },

  /**
   * Brings a class's per-session statuses up to date with the clock, through
   * `/api/classStatuses`, and returns them. The server works them out from the
   * stored class; only the class id is sent.
   */
  async refreshClassStatuses(classId: string): Promise<string[]> {
    const res = await fetch('/api/classStatuses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId } satisfies ClassStatusesRequestBody),
    })
    if (!res.ok) {
      throw new Error(await errorMessage(res))
    }
    return ((await res.json()) as ClassStatusesResponse).classStatuses
  },

  /**
   * Fetches a single instructor feedback document by ID.
   */
  async fetchInstructorFeedback(
    feedbackId: string,
  ): Promise<ClientInstructorFeedback | null> {
    const snap = await getDoc(doc(db, instructorFeedbackCollection, feedbackId))
    if (!snap.exists()) {
      return null
    }
    return snap.data() as ClientInstructorFeedback
  },

  /**
   * Fetches student profile records for a list of registration ids, each with
   * its parent account's current address (see `Student.email`).
   */
  async fetchStudentList(studentUids: string[]): Promise<Student[]> {
    const docs = await Promise.all(
      studentUids.map((uid) => getDoc(doc(db, registrationsCollection, uid))),
    )
    const list: Student[] = []
    docs.forEach((studentDoc, index) => {
      if (studentDoc.exists()) {
        const data = studentDoc.data()
        if (data) {
          list.push({
            id: studentUids[index],
            name: `${normalizeCapitals(
              data.personal.studentFirstName +
                ' ' +
                data.personal.studentLastName,
            )}`,
            email: '',
            secondaryEmail: data.personal.secondaryEmail || '',
            phone: data.personal.phoneNumber || '',
            grade: data.academic?.grade || '',
            school: data.academic?.school || '',
          })
        }
      }
    })

    const emails = await studentService
      .fetchParentEmails(list.map((student) => student.id))
      .catch((err) => {
        console.error('Could not resolve class list parent addresses:', err)
        return {} as Record<string, string>
      })
    for (const student of list) {
      student.email = emails[student.id] ?? ''
    }
    return list
  },
}

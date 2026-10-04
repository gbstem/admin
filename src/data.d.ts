import type { Timestamp as ServerTimestamp } from 'firebase-admin/firestore'
import type { User as ClientUser } from 'firebase/auth'
import type { Timestamp as ClientTimestamp } from 'firebase/firestore'

declare global {
  declare namespace Data {
    type Role = 'admin' | 'reviewer' | 'applicant'

    type Token<T extends 'client' | 'server' | 'pojo'> = {
      role: Role
      expires: T extends 'client'
        ? ClientTimestamp
        : T extends 'server'
          ? ServerTimestamp
          : Date
      consumable: boolean
      consumers: Array<string>
    }

    namespace User {
      type Peek = {
        uid: string
        email: string
        emailVerified: boolean
        role: Role
      }
      type Profile = {
        // Patched in from the auth object at read time; mirrors portal's
        // profile shape so the uid is the single user identifier on both sites.
        // Deliberately no role - branch on `page.data.user.role`, the claim
        // hooks.server.ts verified (see App.PageData).
        uid: string
      }
      type Store = {
        object: ClientUser
        profile: Profile
      }
    }

    type Resume = {
      url: string
      name: string
    }

    type Decision =
      'accepted' | 'interview' | 'waitlisted' | 'rejected' | 'substitute'

    type Interview = {
      date: string
      interviewer: string
      notes: string
      type: Decision
      likelyDecision: 'likely yes' | 'likely no' | 'likely waitlist' | null
      attendance: 'On Time' | 'Late' | 'No-Show' | 'Null'
      conversation: number
      conversationNotes: string
      lastSemesterNotes: string
      mockLessonExplanations: number
      mockLessonEngagement: number
      mockLessonPace: number
      mockLessonOverall: number
      mockLessonNotes: string
      techNotes: string
      teachingPreferences: string
      availabilityNotes: string
    }

    type EmailData = {
      Subject: string
      From: string
      To: string
      Cc: string
      HTMLBody: string
      ReplyTo: string
      MessageStream: 'outbound'
    }

    /**
     * `available` is open for booking; `pending` names an interviewee;
     * `missed` names one whose interview didn't happen - see `missedBy`.
     */
    type InterviewSlotStatus = 'available' | 'pending' | 'missed'

    /** Which side of a missed interview didn't make it. */
    type InterviewMissedBy = 'interviewer' | 'interviewee'

    type InterviewSlot = {
      date: string
      id: string
      interviewerName: string
      intervieweeFirstName: string
      intervieweeLastName: string
      intervieweeId: string
      // The interviewer's account. Their current address is resolved from it
      // when the slot needs one; no address is stored on the slot.
      interviewerUid: string
      interviewSlotStatus: InterviewSlotStatus
      // Set only on a `missed` slot.
      missedBy?: InterviewMissedBy
      meetingLink: string
    }

    type SlotRequest = {
      date: Date
      id: string
      uid: string
      firstName: string
      lastName: string
    }

    type Registration<T extends 'client' | 'server' | 'pojo'> = {
      personal: {
        // The parent account's address as of submission - the account that
        // registers a student is a parent's, though it holds the `student`
        // role. Kept only as an audit record of what was submitted. Never read
        // it: an account's address changes, and the current one is resolved
        // from the registration's id (see registrationParentUid) wherever it
        // is needed.
        email: string
        studentFirstName: string
        studentLastName: string
        parentFirstName: string
        parentLastName: string
        // A second guardian's address, typed on the form. Not backed by a
        // Firebase Auth account, so nothing keeps it current and it is frozen
        // at submission - but it is the only way to reach that guardian, so
        // it is read to reach a student's family.
        secondaryEmail: string
        dateOfBirth: string
        gender: string
        race: string[]
        phoneNumber: string
        frlp: string
        parentEducation: string
      }
      academic: {
        school: string
        grade: string
      }
      program: {
        csCourse: string
        mathCourse: string
        engineeringCourse: string
        scienceCourse: string
        reason: string
        inPerson: boolean
      }
      inPerson: {
        allergies: string
        parentPickup: string
      }
      agreements: {
        entireProgram: boolean
        timeCommitment: boolean
        submitting: boolean
        mediaRelease: boolean
        bypassAgeLimits: boolean
      }
      meta: {
        uid: string
        submitted: boolean
      }
      timestamps: {
        created: T extends 'client'
          ? ClientTimestamp
          : T extends 'server'
            ? ServerTimestamp
            : Date
        updated: T extends 'client'
          ? ClientTimestamp
          : T extends 'server'
            ? ServerTimestamp
            : Date
      }
    }

    type InstructorFeedback = {
      instructorName: string
      students: string[]
      attendanceList: boolean[]
      date: string
      courseName: string
      feedback: string
      classNumber: number
      id: string
    }

    type StudentFeedback = {
      instructorName: string
      studentName: string
      rating: number
      date: string
      course: string
      feedback: string
    }

    type Application<T extends 'client' | 'server' | 'pojo'> = {
      personal: {
        // The applicant account's address as of submission, kept only as an
        // audit record of what was submitted. Never read it: an account's
        // address changes, and the current one is resolved from the
        // application's id (the applicant's uid) wherever it is needed.
        email: string
        firstName: string
        lastName: string
        dateOfBirth: string
        gender: string
        race: string[]
        phoneNumber: string
      }
      academic: {
        school: string
        graduationYear: string
      }
      program: {
        courses: string[]
        preferences: string
        numClasses: string
        timeSlots: string
        notAvailable: string
        inPerson: boolean
        reason: string
      }
      essay: {
        taughtBefore: boolean
        academicBackground: string
        teachingScenario: string
        why: string
      }
      agreements: {
        entireProgram: boolean
        timeCommitment: boolean
        submitting: boolean
      }
      meta: {
        uid: string
        /**
         * Whether an interview slot currently holds this applicant's
         * interview - true while a slot names them in `intervieweeId` and
         * isn't `missed`, whether that interview is still to come or has
         * been held. Set alongside the slot write (see
         * server/interviewSlots.ts), never as a standalone intent/pipeline
         * flag.
         */
        interview: boolean
        submitted: boolean
        /**
         * Whether a decision document exists for this application. Notes or
         * a likely decision alone create one, so this does not mean the
         * applicant has been decided - `decisionType` says that.
         */
        decided: boolean
        /**
         * The official decision's type, copied from the decision document in
         * the same transaction that records it (server/applicationDecisions),
         * so scheduling can tell a decided applicant from the application
         * alone. Absent or null until there is one. See isFinalDecision.
         */
        decisionType?: Decision | null
      }
      timestamps: {
        created: T extends 'client'
          ? ClientTimestamp
          : T extends 'server'
            ? ServerTimestamp
            : Date
        updated: T extends 'client'
          ? ClientTimestamp
          : T extends 'server'
            ? ServerTimestamp
            : Date
      }
    }

    type Announcement<T extends 'client' | 'server' | 'pojo'> = {
      title: string
      content: string
      timestamp: T extends 'client'
        ? ClientTimestamp
        : T extends 'server'
          ? ServerTimestamp
          : Date
    }

    type Class = {
      classCap: number
      classDay1: string
      classDay2: string
      classTime1: string
      classTime2: string
      course: string
      // Absent on classes written before this field existed. Such a class has
      // no owner any code can act on: portal's class routes authorize the
      // instructor by it, and notifications resolve their address from it.
      instructorUid: string
      otherInstructorUids: string[]
      instructorFirstName: string
      instructorLastName: string
      meetingLink: string
      meetingTimes: Date[]
      completedClassDates: Date[]
      classStatuses: string[]
      feedbackCompleted: boolean[]
      online: boolean
      students: string[]
    }

    type SubRequest = {
      id: string
      classNumber: number
      course: string
      dateOfClass: Date
      originalInstructorUid?: string
      subInstructorId: string
      subInstructorFirstName: string
      subRequestStatus: SubRequestStatus
      link: string
      notes: string
    }
  }

  interface ClientInstructorFeedback {
    courseName: string
    instructorName: string
    feedback: string
    date: string
    classNumber: number
    attendanceList: Record<string, { present: boolean }>
    id: string
    students: string[]
  }
}

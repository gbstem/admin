type ClassData = {
  classDay1: string
  classTime1: string
  classDay2: string
  classTime2: string
  meetingLink: string
  gradeRecommendation: string
  course: string
  meetingTimes: Date[]
  completedClassDates: Date[]
  feedbackCompleted: boolean[]
  classStatuses: string[]
  instructorFirstName: string
  instructorLastName: string
  // The class's owner, and the only way to reach them: rules grant class
  // writes on it and the notification endpoints resolve the instructor's
  // address from it; no address is stored on the class.
  instructorUid: string
  otherInstructorUids: string[]
  classCap: number
  students: string[]
  online: boolean
  id: string
}

export type { ClassData as default }

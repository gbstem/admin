import { alert } from '$lib/stores'
import { normalizeCapitals } from '$lib/utils'
import type { RemindInstructorRequestBody } from '../../../routes/api/remindInstructor/+server'
import type { RemindStudentsRequestBody } from '../../../routes/api/remindStudents/+server'
import type Student from '../types/Student'

/**
 * Send a class reminder email to the student
 * @param studentName The name of the student to send the email to, use "all" if you want to send it ot all of them
 * @param studentEmail The email of the student to send the email to
 * @param instructorName The name of the instructor
 * @param instructorUid The uid of the instructor, resolved to their current email server-side
 * @param otherInstructorUids The uids of other instructors, resolved to current emails server-side
 * @param className The name of the class
 * @param nextMeetingTime The time of the next class
 */
function sendClassReminder(opts: {
  studentList?: Student[]
  studentName?: string
  studentEmail?: string
  instructorName: string
  instructorUid: string
  otherInstructorUids: string[]
  className: string
  nextMeetingTime: string
}) {
  // destructure
  const {
    studentList,
    studentName,
    studentEmail,
    instructorName,
    instructorUid,
    otherInstructorUids,
    className,
    nextMeetingTime,
  } = opts

  /* if student name is not specified, assume it is all */
  if (!studentList) {
    const confirmSend = confirm(
      'Send class reminder to instructor ' + instructorName + '?',
    )
    if (confirmSend) {
      if (nextMeetingTime === 'No Upcoming Classes') {
        alert.trigger('error', 'No upcoming classes found!')
        return
      }
      // The uid only: the server resolves the instructor's current address
      // from Auth.
      const payload: RemindInstructorRequestBody = {
        name: normalizeCapitals(instructorName),
        instructorUid,
        otherInstructorUids: otherInstructorUids,
        class: className,
        classTime: nextMeetingTime,
      }
      fetch('/api/remindInstructor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }).then(async (res) => {
        if (res.ok) {
          alert.trigger('success', 'A reminder email was sent!')
        } else {
          const { message } = await res.json()
          alert.trigger('error', message)
        }
      })
    }
  } else {
    if (!studentEmail || !studentEmail) {
      const confirmSend = confirm('Send class reminder to all students?')
      if (confirmSend) {
        if (nextMeetingTime === 'No Upcoming Classes') {
          alert.trigger('error', 'No upcoming classes found!')
          return
        }
        studentList.map((student) => {
          const payload: RemindStudentsRequestBody = {
            name: normalizeCapitals(student.name),
            email: student.email,
            otherInstructorUids: otherInstructorUids,
            class: className,
            classTime: nextMeetingTime,
            instructorName: normalizeCapitals(instructorName),
          }
          fetch('/api/remindStudents', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          }).then(async (res) => {
            if (res.ok) {
              alert.trigger('success', 'Reminder emails were sent!')
            } else {
              const { message } = await res.json()
              alert.trigger('error', message)
            }
          })
        })
      }
    } else {
      const confirmSend = confirm(
        'Send class reminder to student ' + studentName + '?',
      )
      if (confirmSend) {
        if (nextMeetingTime === 'No Upcoming Classes') {
          alert.trigger('error', 'No upcoming classes found!')
          return
        }
        const payload: RemindStudentsRequestBody = {
          name: studentName || '',
          email: studentEmail || '',
          otherInstructorUids: otherInstructorUids,
          class: className,
          classTime: nextMeetingTime,
          instructorName: normalizeCapitals(instructorName),
        }
        fetch('/api/remindStudents', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }).then(async (res) => {
          if (res.ok) {
            alert.trigger(
              'success',
              'Reminder email was sent to ' + studentName + '!',
            )
          } else {
            const { message } = await res.json()
            alert.trigger('error', message)
          }
        })
      }
    }
  }
}

export default sendClassReminder

import type {} from '../src/data.d.ts'
import { classEditedFields } from '$lib/helpers/editClassForm'

describe('classEditedFields', () => {
  it('keeps only the fields the edit form owns', () => {
    const formData = {
      course: 'Python 1',
      gradeRecommendation: '3-5',
      classCap: 12,
      meetingLink: 'https://zoom.us/j/1',
      classDay1: 'Monday',
      classTime1: '16:00',
      classDay2: 'Wednesday',
      classTime2: '16:00',
      online: true,
      // Whatever else rides along must not reach the save: the roster and
      // schedule are written by enrollment and scheduling, not this form.
      students: ['stale-student'],
      meetingTimes: [],
    }

    expect(classEditedFields(formData)).toEqual({
      course: 'Python 1',
      gradeRecommendation: '3-5',
      classCap: 12,
      meetingLink: 'https://zoom.us/j/1',
      classDay1: 'Monday',
      classTime1: '16:00',
      classDay2: 'Wednesday',
      classTime2: '16:00',
      online: true,
    })
  })
})

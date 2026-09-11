import type ClassData from '../data/types/ClassData'
import type { ClassEditableFields } from '../services/classService'

/**
 * Maps a stored class into superform-compatible values.
 *
 * See `toApplicationFormValues` for why a field missing from this allowlist is
 * invisible: a field the edit form can't show can't be edited. Nothing else is
 * at stake any more - the save merges only `classEditedFields`.
 */
export function toClassFormValues(v: ClassData) {
  return {
    course: v.course || '',
    gradeRecommendation: v.gradeRecommendation || '',
    classCap: v.classCap || 0,
    meetingLink: v.meetingLink || '',
    classDay1: v.classDay1 || '',
    classTime1: v.classTime1 || '',
    classDay2: v.classDay2 || '',
    classTime2: v.classTime2 || '',
    online: v.online !== undefined ? v.online : true,
  }
}

/**
 * The fields EditClassForm owns, ready to be merged into the class document.
 *
 * Everything else on the class - the roster, the generated schedule, the
 * instructor - is left to whoever writes it. This used to be the whole
 * document spread from `values`, the copy loaded when the dialog opened, and
 * written back over the stored class: an enrollment made while it was open
 * lost its place on `students`, while the registration still listed the class.
 */
export function classEditedFields(formData: any): ClassEditableFields {
  return {
    course: formData.course,
    gradeRecommendation: formData.gradeRecommendation,
    classCap: formData.classCap,
    meetingLink: formData.meetingLink,
    classDay1: formData.classDay1,
    classTime1: formData.classTime1,
    classDay2: formData.classDay2,
    classTime2: formData.classTime2,
    online: formData.online,
  }
}

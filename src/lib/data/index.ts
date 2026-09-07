import raceJson from './race.json'
import gendersJson from './genders.json'
import shirtSizeJson from './shirtSizes.json'
import dietaryRestrictionsJson from './dietaryRestrictions.json'
import errorsJson from './errors.json'
import reasonsJson from './reasons.json'
import fieldsJson from './fields.json'
import frlpJson from './frlp.json'
import gradesJson from './grades.json'
import parentEducationJson from './parentEducation.json'
import timeSlotsJson from './timeSlots.json'
import courses from './courses.json'
import classesPerWeekJson from './classesPerWeek.json'
import daysOfWeekJson from './daysOfWeek.json'
import interviewAttendanceJson from './interviewAttendance.json'
import { currentSemester } from './collections'

export type CourseTrack = 'cs' | 'math' | 'engineering' | 'science'

/**
 * A course gbSTEM offers in one half of the year.
 *
 * `id` is the course's page on curriculum.gbstem.org, which is also the URL
 * segment (`/${track}/${id}`) and is case-sensitive there. `name` is both the
 * display string and the exact value stored on class, registration and
 * application documents.
 */
export type Course = {
  id: string
  track: CourseTrack
  name: string
  semester: 'fall' | 'spring'
}

/**
 * Which half of the catalog we're in. Derived from `currentSemester` rather
 * than from the wall clock: the two used to be independent, so from January
 * through July `suffix` still said `Fall26` while `new Date().getMonth() < 7`
 * switched every dropdown to spring - and course names the seed had already
 * written were then offered by no form at all.
 */
const semesterHalf = currentSemester.startsWith('Fall') ? 'fall' : 'spring'

const coursesJson: Course[] = (courses as Course[]).filter(
  (course) => course.semester === semesterHalf,
)

const csCoursesJson = [
  { name: 'I am not interested in the computer science track.' },
  ...coursesJson.filter((c) => c.track === 'cs').map((c) => ({ name: c.name })),
]
const mathCoursesJson = [
  { name: 'I am not interested in the mathematics track.' },
  ...coursesJson
    .filter((c) => c.track === 'math')
    .map((c) => ({ name: c.name })),
]
const engineeringCoursesJson = [
  { name: 'I am not interested in the engineering track.' },
  ...coursesJson
    .filter((c) => c.track === 'engineering')
    .map((c) => ({ name: c.name })),
]
const scienceCoursesJson = [
  { name: 'I am not interested in the science track.' },
  ...coursesJson
    .filter((c) => c.track === 'science')
    .map((c) => ({ name: c.name })),
]

export {
  raceJson,
  gendersJson,
  shirtSizeJson,
  dietaryRestrictionsJson,
  reasonsJson,
  errorsJson,
  fieldsJson,
  frlpJson,
  csCoursesJson,
  mathCoursesJson,
  scienceCoursesJson,
  engineeringCoursesJson,
  gradesJson,
  parentEducationJson,
  timeSlotsJson,
  coursesJson,
  classesPerWeekJson,
  daysOfWeekJson,
  interviewAttendanceJson,
}

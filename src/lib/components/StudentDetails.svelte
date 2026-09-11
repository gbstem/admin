<script lang="ts">
  import Card from '$lib/components/Card.svelte'
  import Select from '$lib/components/Select.svelte'
  import sendClassReminder from '$lib/data/helpers/sendClassReminders'
  import { retreatMealSchedule } from '$lib/data/retreatMealSchedule'
  import type ClassData from '$lib/data/types/ClassData'
  import type Student from '$lib/data/types/Student'
  import { formatClassName } from '$lib/helpers/studentDetails'
  import { studentService } from '$lib/services/studentService'
  import { alert } from '$lib/stores'
  import {
    copyEmails,
    formatClassTimes,
    getNearestFutureClass,
  } from '$lib/utils'
  import { format } from 'date-fns'
  import { cloneDeep } from 'lodash-es'
  import { tick } from 'svelte'
  import Button from './Button.svelte'
  import Dialog from './Dialog.svelte'

  interface Props {
    open?: boolean
    id: string | undefined
  }

  let { open = $bindable(false), id }: Props = $props()

  let studentID = ''
  let loading = $state(true)
  let studentData: Student = $state({
    name: '',
    email: '',
    secondaryEmail: '',
    phone: '',
    grade: 0,
    school: '',
    parentName: '',
  })
  let attendance: ClientInstructorFeedback[] = $state([])
  let enrolledClasses: ClassData[] = $state([])
  let unenrolledClasses: ClassData[] = $state([])
  let selectedAddClass = $state('')
  let selectedDropClass = $state('')
  // Bumped when the dialog is closed so reopening the same student still
  // reloads fresh data - the effect below tracks this alongside `id`.
  let reloadTrigger = $state(0)

  let selectedAddClassData = $derived.by(() => {
    return unenrolledClasses.find(
      (opt) => formatClassName(opt) === selectedAddClass,
    )
  })
  let selectedDropClassData = $derived.by(() => {
    return enrolledClasses.find(
      (opt) => formatClassName(opt) === selectedDropClass,
    )
  })

  let checkInLoading = $state(true)
  let checkedIn = $state(false)
  let checkedInAt: any = $state(null)
  let food: Record<string, Record<string, boolean>> = $state({})

  // Load student classes and info
  async function loadStudentClasses(studentId: string) {
    checkInLoading = true
    enrolledClasses = []
    unenrolledClasses = []
    attendance = []
    selectedAddClass = ''
    selectedDropClass = ''

    try {
      const details = await studentService.fetchStudentFullDetails(studentId)
      if (details.studentData) {
        studentData = details.studentData
      }
      studentID = details.studentID
      checkedIn = details.checkedIn
      checkedInAt = details.checkedInAt
      food = details.food
      enrolledClasses = details.enrolledClasses
      unenrolledClasses = details.unenrolledClasses
      attendance = details.attendance
    } finally {
      checkInLoading = false
    }
  }

  // Watch for id changes (or a forced reload after close) and reload
  $effect(() => {
    const currentId = id
    void reloadTrigger
    if (!currentId) return
    ;(async () => {
      loading = true
      try {
        await loadStudentClasses(currentId)
      } catch (err) {
        console.error('Student classes load error:', err)
      } finally {
        loading = false
      }
    })()
  })

  // Add class
  async function addClass(selectedClass: ClassData | undefined) {
    if (!studentID || !selectedClass?.id) {
      alert.trigger('error', 'Student ID or class is missing.')
      return
    }
    try {
      await studentService.enrollStudent(studentData, selectedClass, studentID)
      alert.trigger('success', 'Enrolled in class successfully!')
      selectedAddClass = ''
      await tick()
      await loadStudentClasses(studentID)
    } catch (error) {
      console.error('Class addition error:', error)
      alert.trigger('error', 'Failed to add class.')
    }
  }

  // Drop class
  async function dropClass(selectedClass: ClassData | undefined) {
    if (!studentID || !selectedClass?.id) {
      alert.trigger('error', 'Student ID or class is missing.')
      return
    }
    try {
      await studentService.dropStudentFromClass(selectedClass.id, studentID)
      alert.trigger('success', 'Dropped class successfully!')
      selectedDropClass = ''
      await tick()
      await loadStudentClasses(studentID)
    } catch (error) {
      console.error('Class drop error:', error)
      alert.trigger('error', 'Failed to drop class.')
    }
  }

  async function handleCheckIn() {
    if (!studentID) return
    const now = new Date()
    try {
      await studentService.checkInStudent(studentID, now)
      checkedIn = true
      checkedInAt = now
      food = cloneDeep(retreatMealSchedule)
      alert.trigger('success', 'Student checked in successfully!')
    } catch (error) {
      console.error('Check-in error:', error)
      alert.trigger('error', 'Failed to check in.')
    }
  }

  async function handleMeal(date: string, meal: string, state: boolean) {
    if (!studentID) return
    try {
      await studentService.updateStudentMeal(studentID, date, meal, !state)
      food[date][meal] = !state
      food = { ...food }
    } catch (error) {
      console.error('Meal update error:', error)
      alert.trigger('error', 'Failed to update meal.')
    }
  }
</script>

<Dialog bind:open size="full" alert>
  {#snippet title()}
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>Student Attendance and Information</div>
      <Button
        color="red"
        onclick={() => {
          loading = true
          reloadTrigger++
          open = false
        }}
      >
        Close
      </Button>
    </div>
  {/snippet}
  {#snippet description()}
    <div class="w-full min-w-0">
      <div class="mt-4 justify-center">
        {#each enrolledClasses as value, i (value.id)}
          <Card>
            <div
              class="flex flex-wrap items-start justify-between gap-3 sm:items-center"
            >
              <h2 class="font-bold">Class {i + 1} Information</h2>
              <Button
                color="blue"
                onclick={() =>
                  sendClassReminder({
                    studentList: [studentData],
                    studentName: studentData.name,
                    studentEmail: studentData.email,
                    instructorName: value.instructorFirstName,
                    instructorEmail: value.instructorEmail,
                    instructorUid: value.instructorUid,
                    otherInstructorUids: value.otherInstructorUids ?? [],
                    className: value.course,
                    nextMeetingTime: getNearestFutureClass(value.meetingTimes),
                  })}
              >
                Send {value.course} Class Reminder To Student?
              </Button>
            </div>
            <fieldset class="mt-4 min-w-0 space-y-4">
              <div class="w-full overflow-x-auto">
                <table class="w-full min-w-150 border-collapse text-left">
                  <thead>
                    <tr>
                      <th class="border-b p-2 whitespace-nowrap">Course</th>
                      <th class="border-b p-2 whitespace-nowrap">Instructor</th>
                      <th class="border-b p-2 whitespace-nowrap"
                        >Instructor Email</th
                      >
                      <th class="border-b p-2 whitespace-nowrap"
                        >Meeting Link</th
                      >
                      <th class="border-b p-2 whitespace-nowrap">Format</th>
                      <th class="border-b p-2 whitespace-nowrap">Class Times</th
                      >
                    </tr>
                  </thead>
                  <tbody>
                    <tr class="border-b">
                      <td class="p-2 whitespace-nowrap">{value.course}</td>
                      <td class="p-2 whitespace-nowrap"
                        >{value.instructorFirstName}
                        {value.instructorLastName}</td
                      >
                      <td class="p-2 whitespace-nowrap"
                        >{value.instructorEmail}</td
                      >
                      <td class="p-2 whitespace-nowrap">{value.meetingLink}</td>
                      <td class="p-2 whitespace-nowrap"
                        >{value.online ? 'Online' : 'In-Person'}</td
                      >
                      <td class="p-2 whitespace-nowrap"
                        >{formatClassTimes(
                          [value.classDay1, value.classDay2],
                          [value.classTime1, value.classTime2],
                        )}</td
                      >
                    </tr>
                  </tbody>
                </table>
              </div>
              <h2 class="font-bold">Attendance</h2>
              <div class="w-full overflow-x-auto">
                <table class="w-full min-w-125 border-collapse text-left">
                  <thead>
                    <tr>
                      <th class="border-b p-2 whitespace-nowrap"
                        >Class Number</th
                      >
                      <th class="border-b p-2 whitespace-nowrap">Date</th>
                      <th class="border-b p-2 whitespace-nowrap">Attended</th>
                      <th class="border-b p-2 whitespace-nowrap">Feedback</th>
                    </tr>
                  </thead>
                  {#each attendance as att (att.id)}
                    {#if att.courseName === value.course && att.id.includes(value.id) && Object.keys(att.attendanceList).includes(studentData.name)}
                      <tbody>
                        <tr class="border-b">
                          <td class="p-2 whitespace-nowrap"
                            >{att.classNumber}</td
                          >
                          <td class="p-2 whitespace-nowrap">{att.date}</td>
                          <td class="p-2 whitespace-nowrap"
                            >{att.attendanceList[studentData.name]?.present
                              ? 'Yes'
                              : 'No'}</td
                          >
                          <td class="p-2 whitespace-nowrap">{att.feedback}</td>
                        </tr>
                      </tbody>
                    {/if}
                  {/each}
                </table>
              </div>
            </fieldset>
          </Card>
        {/each}
      </div>

      <Card class="mt-5 mb-4">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="font-bold">Student Information</h2>
          <Button
            onclick={() =>
              copyEmails([studentData.email, studentData.secondaryEmail])}
            class="flex items-center gap-1"
          >
            <svg
              fill="#000"
              height="20"
              width="20"
              viewBox="0 0 352.804 352.804"
            >
              <g>
                <path
                  d="M318.54,57.282h-47.652V15c0-8.284-6.716-15-15-15H34.264c-8.284,0-15,6.716-15,15v265.522c0,8.284,6.716,15,15,15h47.651
           v42.281c0,8.284,6.716,15,15,15H318.54c8.284,0,15-6.716,15-15V72.282C333.54,63.998,326.824,57.282,318.54,57.282z
            M49.264,265.522V30h191.623v27.282H96.916c-8.284,0-15,6.716-15,15v193.24H49.264z M303.54,322.804H111.916V87.282H303.54V322.804
           z"
                />
              </g>
            </svg>
            <span>Copy Emails</span>
          </Button>
        </div>
        <div class="m-5 overflow-auto">
          <table class="w-full min-w-150 border-collapse text-left">
            <thead>
              <tr>
                <th class="border-b p-2 whitespace-nowrap">Student Name</th>
                <th class="border-b p-2 whitespace-nowrap">Email</th>
                <th class="border-b p-2 whitespace-nowrap">Secondary Email</th>
                <th class="border-b p-2 whitespace-nowrap">Phone</th>
                <th class="border-b p-2 whitespace-nowrap">Grade</th>
                <th class="border-b p-2 whitespace-nowrap">School</th>
              </tr>
            </thead>
            <tbody>
              <tr class="border-b">
                <td class="p-2 whitespace-nowrap">{studentData.name}</td>
                <td class="p-2 whitespace-nowrap">{studentData.email}</td>
                <td class="p-2 whitespace-nowrap"
                  >{studentData.secondaryEmail}</td
                >
                <td class="p-2 whitespace-nowrap">{studentData.phone}</td>
                <td class="p-2 whitespace-nowrap">{studentData.grade}</td>
                <td class="p-2 whitespace-nowrap">{studentData.school}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {#if !loading}
          <div class="lg:w-1/2">
            <Select
              bind:value={selectedAddClass}
              options={unenrolledClasses.map((c) => {
                return {
                  name: formatClassName(c),
                }
              })}
              label="Select a class"
            />
          </div>
          <Button
            color="green"
            onclick={() => addClass(selectedAddClassData)}
            class="mt-4">Add Class</Button
          >
          <div class="lg:w-1/2">
            <Select
              bind:value={selectedDropClass}
              options={enrolledClasses.map((c) => {
                return {
                  name: formatClassName(c),
                }
              })}
              label="Select a class"
            />
          </div>
          <Button
            color="red"
            onclick={() => dropClass(selectedDropClassData)}
            class="mt-4">Drop Class</Button
          >
        {:else}
          <div class="p-4 text-gray-500">Loading classes…</div>
        {/if}
      </Card>

      <Card class="mt-5 mb-4">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="font-bold">Check In & Meals</h2>
        </div>
        {#if checkInLoading}
          <div class="p-4 text-gray-500">Loading check-in details…</div>
        {:else}
          <div>
            <div class="mb-4 flex items-center gap-2">
              <span class="font-semibold">Checked in:</span>
              <div>
                {#if checkedIn}
                  <span class="font-medium text-green-600">
                    {checkedInAt ? format(checkedInAt, 'yyyy.MM.dd p') : 'Yes'}
                  </span>
                {:else}
                  <div class="flex items-center gap-1 text-red-500">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke-width="1.5"
                      stroke="currentColor"
                      class="h-5 w-5"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span>No</span>
                  </div>
                {/if}
              </div>
            </div>
            <div class="mb-4">
              {#if !checkedIn}
                <Button color="green" onclick={handleCheckIn}>Check In</Button>
              {/if}
            </div>
            <div class="space-y-4">
              {#if checkedIn}
                <div class="border-b pb-1 font-bold">Meal Status</div>
                {#each Object.keys(food).sort() as date (date)}
                  <div class="rounded-md bg-gray-50 p-3">
                    <div class="mb-2 font-semibold text-gray-700">{date}</div>
                    <div class="flex flex-wrap gap-2">
                      {#each Object.keys(food[date]) as meal (meal)}
                        <Button
                          color={food[date][meal] ? 'gray' : 'blue'}
                          onclick={() =>
                            handleMeal(date, meal, food[date][meal])}
                        >
                          {meal}: {food[date][meal]
                            ? 'already eaten'
                            : 'available'}
                        </Button>
                      {/each}
                    </div>
                  </div>
                {/each}
              {/if}
            </div>
          </div>
        {/if}
      </Card>
    </div>
  {/snippet}
</Dialog>

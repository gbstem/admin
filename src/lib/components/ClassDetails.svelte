<script lang="ts">
  import Card from '$lib/components/Card.svelte'
  import sendClassReminder from '$lib/data/helpers/sendClassReminders'
  import type ClassData from '$lib/data/types/ClassData'
  import { ClassStatus } from '$lib/data/types/ClassStatus'
  import type Student from '$lib/data/types/Student'
  import { classService } from '$lib/services/classService'
  import { alert } from '$lib/stores'
  import {
    copyEmails,
    formatDate,
    getNearestFutureClass,
    isClassUpcoming,
    timestampToDate,
  } from '$lib/utils'
  import Button from './Button.svelte'
  import Dialog from './Dialog.svelte'
  import EditClassForm from './forms/EditClassForm.svelte'

  interface Props {
    open?: boolean
    id: string | undefined
  }

  let { open = $bindable(false), id }: Props = $props()

  let disabled = $state(true)

  let studentList: Student[] = $state([])

  let values: ClassData = $state({
    course: '',
    instructorFirstName: '',
    instructorLastName: '',
    instructorEmail: '',
    instructorUid: '',
    otherInstructorUids: [],
    classDay1: '',
    classTime1: '',
    classDay2: '',
    classTime2: '',
    meetingLink: '',
    classCap: 0,
    online: true,
    gradeRecommendation: '',
    classStatuses: [],
    feedbackCompleted: [],
    completedClassDates: [],
    meetingTimes: [],
    students: [],
    id: '',
  })

  let formEl: HTMLFormElement | undefined = $state()
  // Gates the Edit button: this dialog keeps the previous class's `values`
  // when it reopens, so without this an admin could start editing stale data
  // and have the fetch below overwrite the edits when it lands.
  let loaded = $state(false)
  // Bumped only when the form should be reseeded from `values` - see the note
  // on the $effect in EditRegistrationForm.svelte.
  let seedVersion = $state(0)

  async function loadClassData(classId: string) {
    studentList = []
    disabled = true
    loaded = false

    try {
      const data = await classService.fetchClassData(classId)
      if (data) {
        values = { ...data }
        seedVersion++
        loaded = true
        const studentUids = data.students
        if (studentUids) {
          getStudentList(studentUids)
        }
        checkStatuses()
      } else {
        alert.trigger('error', 'Registration not found.')
      }
    } catch (error) {
      console.error('Class data load error:', error)
      alert.trigger('error', 'Failed to load class data.')
    }
  }

  function handleEdit() {
    disabled = false
  }
  function handleSaveChanges() {
    if (formEl) {
      formEl.requestSubmit()
    }
  }
  function handleDeleteChanges() {
    disabled = true
    // Reset to the current Firestore loaded data. The reseed is what discards
    // the form's edits; the copy below just keeps `values` a fresh object.
    values = { ...values }
    seedVersion++
  }

  /**
   * Update the status of each class session in the array based on the current time.
   */
  function checkStatuses() {
    if (id === undefined) return
    const { meetingTimes, classStatuses, feedbackCompleted } = values
    let changed = false
    const newStatuses = [...classStatuses]
    for (let i = 0; i < meetingTimes.length; i++) {
      let targetStatus = newStatuses[i]
      if (
        new Date().getTime() > new Date(meetingTimes[i]).getTime() &&
        newStatuses[i] !== ClassStatus.EverythingComplete &&
        newStatuses[i] !== ClassStatus.FeedbackIncomplete
      ) {
        targetStatus = feedbackCompleted[i]
          ? ClassStatus.EverythingComplete
          : ClassStatus.ClassNotHeld
      } else if (isClassUpcoming(new Date(meetingTimes[i]))) {
        targetStatus = ClassStatus.ClassUpcomingSoon
      } else if (
        newStatuses[i] === ClassStatus.FeedbackIncomplete &&
        feedbackCompleted[i]
      ) {
        targetStatus = ClassStatus.EverythingComplete
      }
      if (targetStatus !== newStatuses[i]) {
        newStatuses[i] = targetStatus
        changed = true
      }
    }
    if (changed) {
      values.classStatuses = newStatuses
      classService
        .updateClassStatuses(id, newStatuses)
        .catch((err) => console.warn('Failed to update classStatuses:', err))
    }
  }

  const getStudentList = async (studentUids: string[]) => {
    try {
      const list = await classService.fetchStudentList(studentUids)
      studentList = list
    } catch (err) {
      console.error('Failed to load student list:', err)
      alert.trigger('error', 'Failed to load student list.')
    }
  }
  $effect(() => {
    if (open && id !== undefined) {
      loadClassData(id)
    }
  })
</script>

<Dialog bind:open size="full" alert>
  {#snippet title()}
    Class Details
  {/snippet}
  {#snippet description()}
    <div class="w-full min-w-0">
      <Card
        class="sticky top-2 z-50 flex flex-wrap items-center justify-between gap-3 p-3"
      >
        {#if !disabled}
          <div class="flex flex-wrap gap-2">
            <Button color="green" onclick={handleSaveChanges}
              >Save changes</Button
            >
            <Button color="red" onclick={handleDeleteChanges}
              >Cancel changes</Button
            >
          </div>
        {/if}
        <div class="flex flex-wrap gap-2">
          <Button color="green" onclick={handleEdit} disabled={!loaded}>
            Edit
          </Button>
          <Button color="red" onclick={() => (open = false)}>Close</Button>
          <Button
            color="blue"
            onclick={() =>
              sendClassReminder({
                studentList: studentList,
                instructorName: values.instructorFirstName,
                otherInstructorUids: values.otherInstructorUids ?? [],
                className: values.course,
                nextMeetingTime: getNearestFutureClass(values.meetingTimes),
              })}>Send Reminder To All Students</Button
          >
          <Button
            color="blue"
            onclick={() =>
              sendClassReminder({
                instructorName: values.instructorFirstName,
                instructorUid: values.instructorUid,
                otherInstructorUids: values.otherInstructorUids ?? [],
                className: values.course,
                nextMeetingTime: getNearestFutureClass(values.meetingTimes),
              })}>Send Instructor Reminder</Button
          >
        </div>
      </Card>
      <div class="mt-4 flex justify-center">
        <EditClassForm
          bind:formEl
          bind:disabled
          bind:values
          {id}
          {seedVersion}
          {loaded}
        />
      </div>

      <div>
        <Card class="mt-5 mb-4">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="font-bold">Class List</h2>
            <Button
              onclick={() =>
                copyEmails(
                  studentList.flatMap((student) => [
                    student.email,
                    student.secondaryEmail,
                  ]),
                )}
              class="flex items-center gap-1"
            >
              <svg
                fill="#000000"
                height="20"
                width="20"
                version="1.1"
                id="Capa_1"
                xmlns="http://www.w3.org/2000/svg"
                xmlns:xlink="http://www.w3.org/1999/xlink"
                viewBox="0 0 352.804 352.804"
                xml:space="preserve"
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
            <table
              class="min-w-150"
              style="border-collapse: collapse; width: 100%; text-align: left;"
            >
              <thead>
                <tr>
                  <th
                    style="white-space: nowrap; border-bottom: 1px solid #ccc; padding: 8px;"
                    >Student Name</th
                  >
                  <th
                    style="white-space: nowrap; border-bottom: 1px solid #ccc; padding: 8px;"
                    >Email</th
                  >
                  <th
                    style="white-space: nowrap; border-bottom: 1px solid #ccc; padding: 8px;"
                    >Secondary Email</th
                  >
                  <th
                    style="white-space: nowrap; border-bottom: 1px solid #ccc; padding: 8px;"
                    >Phone</th
                  >
                  <th
                    style="white-space: nowrap; border-bottom: 1px solid #ccc; padding: 8px;"
                    >Grade</th
                  >
                  <th
                    style="white-space: nowrap; border-bottom: 1px solid #ccc; padding: 8px;"
                    >School</th
                  >
                </tr>
              </thead>
              <tbody>
                {#each studentList as student (student.email)}
                  <tr
                    style="border-bottom: 1px solid #ccc;"
                    class="whitespace-nowrap"
                  >
                    <td style="padding: 8px;">{student.name}</td>
                    <td style="padding: 8px;">{student.email}</td>
                    <td style="padding: 8px;">{student.secondaryEmail}</td>
                    <td style="padding: 8px;">{student.phone}</td>
                    <td style="padding: 8px;">{student.grade}</td>
                    <td style="padding: 8px;">{student.school}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </Card>
        <div>
          <div
            class="grid grid-cols-1 justify-between gap-1"
            style="margin-top:1rem;"
          >
            <div>
              <div class="mb-2 rounded-lg bg-gray-100 p-4">
                <strong>Schedule</strong>
              </div>
              {#if values.meetingTimes}
                {#each values.meetingTimes as meetingTime, i (i)}
                  {#if values.classStatuses[i] === ClassStatus.EverythingComplete}
                    <div class="mb-2 rounded-lg bg-green-100 p-4">
                      <div class="flex items-center justify-between">
                        <p class="meeting-time">
                          {formatDate(timestampToDate(meetingTime))}
                        </p>
                      </div>
                    </div>
                  {:else if values.classStatuses[i] === ClassStatus.FeedbackIncomplete}
                    <div class="mb-2 rounded-lg bg-yellow-100 p-4">
                      <div class="flex items-center justify-between">
                        <p class="meeting-time">
                          {formatDate(timestampToDate(meetingTime))}
                        </p>
                      </div>
                    </div>
                  {:else if values.classStatuses[i] === ClassStatus.ClassUpcomingSoon}
                    <div class="mb-2 rounded-lg bg-blue-100 p-4">
                      <div class="flex items-center justify-between">
                        <p class="meeting-time">
                          {formatDate(timestampToDate(meetingTime))}
                        </p>
                      </div>
                    </div>
                  {:else if values.classStatuses[i] === ClassStatus.ClassNotHeld}
                    <div class="mb-2 rounded-lg bg-red-100 p-4">
                      <div class="flex items-center justify-between">
                        <p class="meeting-time">
                          {formatDate(timestampToDate(meetingTime))}
                        </p>
                      </div>
                    </div>
                  {:else}
                    <div class="mb-2 rounded-lg bg-gray-100 p-4">
                      <div class="flex items-center justify-between">
                        <p class="meeting-time">
                          {formatDate(timestampToDate(meetingTime))}
                        </p>
                      </div>
                    </div>
                  {/if}
                {/each}
              {/if}
            </div>
          </div>
        </div>
      </div>
    </div>
  {/snippet}
</Dialog>

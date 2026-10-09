<script lang="ts">
  import Card from '#lib/components/Card.svelte'
  import {
    classService,
    type ClientInstructorFeedback,
  } from '#lib/services/classService.js'
  import { alert } from '#lib/stores.js'
  import Button from './Button.svelte'
  import Dialog from './Dialog.svelte'

  interface Props {
    open?: boolean
    id: string | undefined
  }

  let { open = $bindable(false), id }: Props = $props()

  let values: ClientInstructorFeedback = $state({
    courseName: '',
    instructorName: '',
    feedback: '',
    date: '',
    classNumber: 0,
    attendanceList: {},
    id: '',
    students: [],
  })

  $effect(() => {
    const currentId = id
    if (currentId === undefined) return
    let cancelled = false
    ;(async () => {
      try {
        const feedback = await classService.fetchInstructorFeedback(currentId)
        if (cancelled) return
        if (feedback) {
          values = feedback
        } else {
          alert.trigger('error', 'Feedback not found.')
        }
      } catch (err: any) {
        console.error('Failed to load feedback:', err)
        alert.trigger('error', 'Failed to load feedback.')
      }
    })()
    return () => {
      cancelled = true
    }
  })
</script>

<Dialog bind:open size="full" alert>
  {#snippet title()}
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        Feedback for {values.instructorName}'s {values.courseName} Class #{values.classNumber}
      </div>
      <Button color="red" onclick={() => (open = false)}>Close</Button>
    </div>
  {/snippet}
  {#snippet description()}
    <div class="w-full min-w-0">
      <div style="text-align:left;">
        <Card class="mb-4">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="font-bold">Class Details</h2>
          </div>
          <div class="m-5 overflow-auto">
            <table
              class="min-w-125"
              style="border-collapse: collapse; width: 100%;"
            >
              <thead>
                <tr>
                  <th
                    style="white-space: nowrap; border-bottom: 1px solid #ccc; padding: 8px;"
                    >Course Name</th
                  >
                  <th
                    style="white-space: nowrap; border-bottom: 1px solid #ccc; padding: 8px;"
                    >Class Number</th
                  >
                  <th
                    style="white-space: nowrap; border-bottom: 1px solid #ccc; padding: 8px;"
                    >Instructor</th
                  >
                  <th
                    style="white-space: nowrap; border-bottom: 1px solid #ccc; padding: 8px;"
                    >Feedback</th
                  >
                </tr>
              </thead>
              <tbody>
                <tr style="border-bottom: 1px solid #ccc;">
                  <td style="padding: 8px;">{values.courseName}</td>
                  <td style="padding: 8px;">{values.classNumber}</td>
                  <td style="padding: 8px;">{values.instructorName}</td>
                  <td style="padding: 8px;">{values.feedback}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
        <Card class="mt-5 mb-4">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="font-bold">Student Attendance</h2>
          </div>
          <div class="m-5" style="overflow: auto;">
            <table style="border-collapse: collapse; width: 100%;">
              <thead>
                <tr>
                  <th
                    style="white-space: nowrap; border-bottom: 1px solid #ccc; padding: 8px;"
                    >Student Name</th
                  >
                  <th
                    style="white-space: nowrap; border-bottom: 1px solid #ccc; padding: 8px;"
                    >Attendance</th
                  >
                </tr>
              </thead>
              <tbody>
                {#each Object.keys(values.attendanceList) as attendance (attendance)}
                  <tr style="border-bottom: 1px solid #ccc;">
                    <td style="padding: 8px;">{attendance}</td>
                    <td style="padding: 8px;"
                      >{values.attendanceList[attendance]?.present
                        ? 'Yes'
                        : 'No'}</td
                    >
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  {/snippet}
</Dialog>

<script lang="ts">
  import {
    candidateWeek,
    describeCellTime,
    type PickTarget,
  } from '#lib/helpers/availabilityGrid.js'
  import {
    intervieweeLabel,
    type CandidateAvailability,
    type EligibleInterviewee,
  } from '#lib/helpers/setInterviewTimes.js'
  import AvailabilityGrid from '#lib/shared/AvailabilityGrid.svelte'
  import {
    addWeeks,
    formatShortDay,
    rowRange,
    weekColumns,
    weekStart,
    type CellKey,
  } from '#lib/shared/availabilityGrid.js'
  import { INTERVIEW_DURATION_MINUTES } from '#lib/shared/interviews.js'
  import { formatDateLocal } from '#lib/utils.js'
  import Button from './Button.svelte'
  import TextInput from './TextInput.svelte'

  interface Props {
    window: { opens: Date; closes: Date }
    availability: CandidateAvailability[]
    slots: Data.InterviewSlot[]
    uid: string | null | undefined
    /** Candidates' current addresses, by application id. */
    emails: Record<string, string>
    /** The interviewer's link for slots created here. */
    meetingLink: string
    onassign: (
      interviewee: EligibleInterviewee,
      target: PickTarget,
      meetingLink: string,
    ) => Promise<void>
  }

  let {
    window,
    availability,
    slots,
    uid,
    emails,
    meetingLink = $bindable(''),
    onassign,
  }: Props = $props()

  // Each candidate's week on show, by uid; the first week with their times
  // until the interviewer moves.
  let weekIndexes: Record<string, number> = $state({})

  function weeksOf(times: Date[]): Date[] {
    const seen = new Map<number, Date>()
    for (const time of times) {
      const week = weekStart(time)
      seen.set(week.getTime(), week)
    }
    return [...seen.values()].sort((a, b) => a.getTime() - b.getTime())
  }

  let assigning = $state(false)

  async function pick(
    interviewee: EligibleInterviewee,
    week: Date,
    key: CellKey,
    target: PickTarget | undefined,
  ) {
    if (!target || assigning) return
    const link = target.slot?.meetingLink || meetingLink
    const what = target.slot
      ? 'assign them your open slot at'
      : 'create a slot assigned to them at'
    if (
      !confirm(
        `${intervieweeLabel(interviewee)}: ${what} ${describeCellTime(week, key)}? An email will be sent to them confirming the interview has been scheduled.`,
      )
    ) {
      return
    }
    assigning = true
    try {
      await onassign(interviewee, target, link)
    } finally {
      assigning = false
    }
  }
</script>

<h2 class="font-bold">Candidate Availability</h2>
<p class="mt-1 text-sm text-gray-600">
  Candidates who found no open slot that works paint the times they're free.
  Green cells are free for you: click one to create a slot assigned to that
  candidate. "Open" cells are your open slots there: click to assign one. Either
  emails them.
</p>
{#if availability.length}
  <div class="mt-3 max-w-xl">
    <TextInput
      name="candidate-availability-meeting-link"
      label="Your meeting link (for slots created here)"
      bind:value={meetingLink}
    />
  </div>
{:else}
  <p class="mt-3 text-sm text-gray-500">
    No candidate has painted availability that still needs scheduling.
  </p>
{/if}

{#each availability as candidate (candidate.interviewee.uid)}
  {@const weeks = weeksOf(candidate.times)}
  {@const index = Math.min(
    weekIndexes[candidate.interviewee.uid] ?? 0,
    weeks.length - 1,
  )}
  {@const week = weeks[index]}
  {@const view = candidateWeek(candidate.times, slots, uid, week)}
  <div
    class="mt-4 rounded-lg border border-gray-200 p-4"
    data-testid="candidate-availability"
  >
    <p>
      <b>{intervieweeLabel(candidate.interviewee)}</b>
      <span class="ml-2"
        >{emails[candidate.interviewee.applicationId] ?? ''}</span
      >
    </p>
    <p class="text-sm text-gray-600">
      {candidate.times.length} time{candidate.times.length === 1 ? '' : 's'} offered.
      Last updated {formatDateLocal(candidate.updated)}.
    </p>
    <div class="my-2 flex flex-wrap items-center gap-2">
      <Button
        class="px-2 py-1"
        disabled={index <= 0}
        onclick={() =>
          (weekIndexes[candidate.interviewee.uid] = Math.max(0, index - 1))}
        >← Previous</Button
      >
      <span class="text-sm font-semibold">Week of {formatShortDay(week)}</span>
      <Button
        class="px-2 py-1"
        disabled={index >= weeks.length - 1}
        onclick={() =>
          (weekIndexes[candidate.interviewee.uid] = Math.min(
            weeks.length - 1,
            index + 1,
          ))}>Next →</Button
      >
    </div>
    <AvailabilityGrid
      label="{intervieweeLabel(
        candidate.interviewee,
      )}'s availability, week of {formatShortDay(week)}"
      mode="pick"
      columns={weekColumns(week, window)}
      rows={rowRange(
        candidate.times.filter(
          (time) => time >= week && time < addWeeks(week, 1),
        ),
      )}
      durationMinutes={INTERVIEW_DURATION_MINUTES}
      cells={view.cells}
      onpick={(key) =>
        pick(candidate.interviewee, week, key, view.targets.get(key))}
    />
  </div>
{/each}

<script lang="ts">
  import { user } from '#lib/client/firebase.js'
  import { interviewSlotSchema } from '#lib/components/forms/schemas.js'
  import {
    describeSave,
    lastMeetingLink,
    ownSlotWeek,
    weekChanges,
  } from '#lib/helpers/availabilityGrid.js'
  import { interviewService } from '#lib/services/interviewService.js'
  import { alert } from '#lib/stores.js'
  import AvailabilityGrid from '#lib/shared/AvailabilityGrid.svelte'
  import {
    DEFAULT_ROWS,
    addWeeks,
    expandGrid,
    formatShortDay,
    isOpenCell,
    patternColumns,
    rowRange,
    weekColumns,
    weeksInWindow,
    type CellKey,
  } from '#lib/shared/availabilityGrid.js'
  import { localTimeZoneLabel } from '#lib/shared/gbstemTime.js'
  import {
    INTERVIEW_DURATION_MINUTES,
    type InterviewWindow,
  } from '#lib/shared/interviews.js'
  import { onMount } from 'svelte'
  import Button from './Button.svelte'
  import Card from './Card.svelte'
  import TextInput from './TextInput.svelte'
  import Loading from './Loading.svelte'

  interface Props {
    window: InterviewWindow
  }

  let { window }: Props = $props()

  // Read once: the page is opened, used and left in one sitting.
  const now = new Date()
  const timeZone = localTimeZoneLabel()

  // The weeks that still have a time to offer in them.
  let weeks = $derived(
    weeksInWindow(window).filter((week) => addWeeks(week, 1) > now),
  )

  let uid = $state<string | null>(null)
  let slots: Data.InterviewSlot[] = $state([])
  let loading = $state(true)
  let loadError = $state<string | null>(null)
  let saving = $state(false)

  // ------------------------------------------------------- the weekly pattern

  let pattern = $state(new Set<CellKey>())
  let fromIndex = $state(0)
  // Null until the interviewer picks one: the last week left in the window.
  let throughChoice = $state<number | null>(null)
  // What "Through" shows and the range uses: never before "Repeat from", so
  // moving that past it never leaves the drop-down blank.
  let throughIndex = $derived(
    Math.min(
      Math.max(throughChoice ?? weeks.length - 1, fromIndex),
      weeks.length - 1,
    ),
  )
  let meetingLink = $state('')

  let range = $derived(
    weeks.length
      ? {
          from: weeks[Math.min(fromIndex, weeks.length - 1)],
          through: weeks[throughIndex],
        }
      : null,
  )
  let weekCount = $derived(
    range
      ? Math.round(
          (range.through.getTime() - range.from.getTime()) /
            (7 * 24 * 60 * 60 * 1000),
        ) + 1
      : 0,
  )
  let patternDates = $derived(
    range
      ? expandGrid(pattern, range, INTERVIEW_DURATION_MINUTES, { window, now })
      : [],
  )

  function validLink(): string | null {
    const parsed = interviewSlotSchema.shape.meetingLink.safeParse(meetingLink)
    if (parsed.success) return parsed.data
    alert.trigger(
      'error',
      parsed.error.issues[0]?.message ?? 'Enter a valid meeting link.',
    )
    return null
  }

  async function savePattern() {
    if (!patternDates.length) return
    const link = validLink()
    if (link === null) return
    saving = true
    try {
      const created = await interviewService.createOpenInterviewSlots(
        patternDates,
        link,
      )
      alert.trigger('success', describeSave(created, null))
      pattern = new Set()
      await refetch()
    } catch (err: any) {
      console.error('Create slots error:', err)
      alert.trigger('error', `Failed to create slots: ${err.message}`)
    } finally {
      saving = false
    }
  }

  // ------------------------------------------------- one week of real slots

  let reviewIndex = $state(0)
  let reviewWeek = $derived(
    weeks[Math.min(reviewIndex, Math.max(weeks.length - 1, 0))],
  )
  let before = $derived(reviewWeek ? ownSlotWeek(slots, uid, reviewWeek) : null)
  // The week's paint as edited, until it's saved or the week changes.
  let edits = $state<{ week: number; painted: Set<CellKey> } | null>(null)
  let painted = $derived(
    edits && reviewWeek && edits.week === reviewWeek.getTime()
      ? edits.painted
      : (before?.painted ?? new Set<CellKey>()),
  )
  let changes = $derived(
    reviewWeek && before
      ? weekChanges(reviewWeek, before, painted, window, now)
      : { add: [], remove: [] },
  )
  let reviewRows = $derived(
    rowRange(
      slots
        .map((slot) => new Date(slot.date))
        .filter(
          (date) =>
            reviewWeek && date >= reviewWeek && date < addWeeks(reviewWeek, 1),
        ),
      DEFAULT_ROWS,
    ),
  )

  async function saveWeek() {
    const { add, remove } = changes
    if (!add.length && !remove.length) return
    const link = add.length ? validLink() : ''
    if (link === null) return
    saving = true
    try {
      const created = add.length
        ? await interviewService.createOpenInterviewSlots(add, link)
        : null
      const deleted = remove.length
        ? await interviewService.deleteOpenInterviewSlots(remove)
        : null
      alert.trigger('success', describeSave(created, deleted))
      edits = null
      await refetch()
    } catch (err: any) {
      console.error('Save week error:', err)
      alert.trigger('error', `Failed to save this week: ${err.message}`)
      await refetch()
    } finally {
      saving = false
    }
  }

  // ---------------------------------------------------------------- loading

  async function refetch() {
    slots = await interviewService.fetchInterviewSlots()
  }

  onMount(() =>
    user.subscribe(async (current) => {
      if (!current) return
      uid = current.object.uid
      try {
        await refetch()
        meetingLink ||= lastMeetingLink(slots, uid)
        loadError = null
      } catch (err: any) {
        console.error('Failed to load interview slots:', err)
        loadError = err.message || 'Failed to load interview slots.'
      } finally {
        loading = false
      }
    }),
  )

  // The year only when it isn't this one, so a window crossing New Year
  // never lists two weeks with the same label.
  const weekLabel = (week: Date) =>
    `Week of ${formatShortDay(week)}${week.getFullYear() === now.getFullYear() ? '' : `, ${week.getFullYear()}`}`
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
</script>

{#if loading}
  <Loading />
{:else if loadError}
  <div class="rounded-lg bg-red-100 p-4 text-red-700">
    <p class="font-bold">Error loading interview timeslots:</p>
    <p class="mt-1">{loadError}</p>
  </div>
{:else if !weeks.length}
  <Card>
    <p>
      The interview window has closed, so there are no weeks left to offer times
      in.
    </p>
  </Card>
{:else}
  <p class="mb-4 text-sm font-medium text-gray-700">
    Times shown in your local time ({timeZone}). Each row is one
    {INTERVIEW_DURATION_MINUTES}-minute interview.
  </p>

  <Card class="mb-6">
    <h2 class="mb-1 text-xl font-bold">Paint your weekly availability</h2>
    <p class="mb-4 text-sm text-gray-600">
      Drag across the times you're free, then repeat them over the weeks you
      choose. Each painted row becomes one open slot candidates can book. This
      adds to what you told us before; use the
      <a class="text-blue-600 hover:underline" href="#your-slots"
        >Your slots, week by week</a
      > card to delete previously added slots.
    </p>

    <div class="mb-4 grid gap-4 md:grid-cols-3">
      <label class="flex flex-col gap-1 text-sm font-bold">
        Repeat from
        <select
          class="h-12 rounded-md border border-gray-300 px-2"
          bind:value={fromIndex}
          data-testid="repeat-from"
        >
          {#each weeks as week, i (week.getTime())}
            <option value={i}>{weekLabel(week)}</option>
          {/each}
        </select>
      </label>
      <label class="flex flex-col gap-1 text-sm font-bold">
        Through
        <select
          class="h-12 rounded-md border border-gray-300 px-2"
          bind:value={
            () => throughIndex, (index: number) => (throughChoice = index)
          }
          data-testid="repeat-through"
        >
          {#each weeks as week, i (week.getTime())}
            {#if i >= fromIndex}
              <option value={i}>{weekLabel(week)}</option>
            {/if}
          {/each}
        </select>
      </label>
      <!-- Without TextInput's top margin its label lines up with the
           drop-downs' labels. -->
      <TextInput
        class={{ container: 'mt-0' }}
        name="availability-meeting-link"
        label="Your meeting link"
        bind:value={meetingLink}
      />
    </div>

    <AvailabilityGrid
      label="Your weekly availability"
      mode="paint"
      columns={patternColumns()}
      rows={DEFAULT_ROWS}
      durationMinutes={INTERVIEW_DURATION_MINUTES}
      bind:selected={pattern}
    />

    <p class="mt-4 text-sm" data-testid="pattern-preview">
      {#if pattern.size === 0}
        Paint some times to see how many slots this creates.
      {:else}
        This will create {plural(pattern.size, 'interview slot')} per week over
        {plural(weekCount, 'week')} — {plural(patternDates.length, 'slot')} total.
        {#if patternDates.length < pattern.size * weekCount}
          Times already past or outside the interview window are left out.
        {/if}
      {/if}
    </p>
    <div class="mt-3 flex gap-2">
      <Button
        color="blue"
        disabled={saving || !patternDates.length}
        onclick={savePattern}
        >Create {plural(patternDates.length, 'slot')}</Button
      >
      <Button
        disabled={saving || !pattern.size}
        onclick={() => (pattern = new Set())}>Clear</Button
      >
    </div>
  </Card>

  <Card>
    <!-- scroll-mt clears the fixed nav when the link above jumps here. -->
    <h2 id="your-slots" class="mb-1 scroll-mt-24 text-xl font-bold">
      Your slots, week by week
    </h2>
    <p class="mb-4 text-sm text-gray-600">
      Painted cells are your open slots: un-paint one to delete it, or paint
      more to add them. Booked cells show the candidate and are locked; to
      cancel one, delete it from the slot list on the
      <a class="text-blue-600 hover:underline" href="/interviews"
        >Interviews page</a
      >, which emails them.
    </p>

    <div class="mb-3 flex flex-wrap items-center gap-2">
      <Button
        disabled={reviewIndex <= 0}
        onclick={() => (reviewIndex = Math.max(0, reviewIndex - 1))}
        >← Previous week</Button
      >
      <span class="font-semibold" data-testid="review-week"
        >{reviewWeek ? weekLabel(reviewWeek) : ''}</span
      >
      <Button
        disabled={reviewIndex >= weeks.length - 1}
        onclick={() =>
          (reviewIndex = Math.min(weeks.length - 1, reviewIndex + 1))}
        >Next week →</Button
      >
    </div>

    {#if reviewWeek && before}
      {@const week = reviewWeek}
      <AvailabilityGrid
        label="Your slots for the {weekLabel(week)}"
        mode="paint"
        columns={weekColumns(week, window, now)}
        rows={reviewRows}
        durationMinutes={INTERVIEW_DURATION_MINUTES}
        cells={before.cells}
        isDisabled={(key) => !isOpenCell(week, key, window, now)}
        bind:selected={
          () => painted,
          (next) => (edits = { week: week.getTime(), painted: next })
        }
      />
    {/if}

    <p class="mt-4 text-sm" data-testid="week-preview">
      {#if changes.add.length || changes.remove.length}
        Saving adds {plural(changes.add.length, 'slot')} and deletes
        {plural(changes.remove.length, 'open slot')}.
      {:else}
        No changes to this week.
      {/if}
    </p>
    <div class="mt-3 flex gap-2">
      <Button
        color="blue"
        disabled={saving || (!changes.add.length && !changes.remove.length)}
        onclick={saveWeek}>Save this week</Button
      >
      <Button disabled={saving || !edits} onclick={() => (edits = null)}
        >Undo changes</Button
      >
    </div>
  </Card>
{/if}

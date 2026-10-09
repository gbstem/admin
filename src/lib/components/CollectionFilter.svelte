<script lang="ts">
  import Select from './Select.svelte'
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { currentSemester, resolveSemester } from '#lib/data/collections.js'
  import collectionsList from '#lib/data/collectionsList.json'

  const idToName: Record<string, string> = $state({})
  const nameToId: Record<string, string> = {}
  for (const sem of collectionsList) {
    idToName[sem.id] = sem.name
    nameToId[sem.name] = sem.id
  }

  // lib/data/collectionsList.json should be ordered from the most recent
  // semester to the oldest, so that the default semester shown in the
  // dropdown is the most recent one.
  const defaultDisplayName =
    idToName[currentSemester] ?? collectionsList[0]?.name ?? 'ERROR'

  let displayName = $derived(
    idToName[resolveSemester(page.url.searchParams.get('semester'))] ??
      defaultDisplayName,
  )

  function handleChange(newDisplayName: string) {
    // See StatusFilter: an empty box is mid-edit, not a selection. Without
    // this it falls through to `?? currentSemester` below and navigates away
    // from whichever past semester is being browsed.
    if (!newDisplayName) return

    const urlSemester = resolveSemester(page.url.searchParams.get('semester'))
    const targetId = nameToId[newDisplayName] ?? currentSemester
    if (targetId === urlSemester) return

    const base = new URLSearchParams(page.url.search)
    base.set('semester', targetId)
    base.delete('updated') // Reset pagination
    base.delete('page') // Reset page parameter
    // reset: false - see PerPageControl.
    goto(`?${base.toString()}`, { reset: false })
  }

  const options = collectionsList.map((col) => ({ name: col.name }))
</script>

<Select
  class="mt-0 w-64"
  value={displayName}
  onchange={handleChange}
  label="Collection"
  {options}
  required
/>

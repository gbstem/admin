<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { resolveSemester } from '#lib/data/collections.js'
  import collectionsList from '#lib/data/collectionsList.json'

  let selectedId = $derived(
    resolveSemester(page.url.searchParams.get('semester')),
  )

  function handleChange(targetId: string) {
    if (!targetId || targetId === selectedId) return

    const base = new URLSearchParams(page.url.search)
    base.set('semester', targetId)
    base.delete('updated') // Reset pagination
    base.delete('page') // Reset page parameter
    // reset: false - see PerPageControl.
    goto(`?${base.toString()}`, { reset: false })
  }
</script>

<div class="relative mt-0 w-64">
  <label for="collection" class="text-sm font-bold">
    <span>Collection<span class="text-red-500">*</span></span>
  </label>
  <select
    id="collection"
    name="collection"
    value={selectedId}
    onchange={(e) => handleChange(e.currentTarget.value)}
    required
    class="mt-1 block h-12 w-full rounded-md border border-gray-400 bg-white px-3 transition-colors focus:border-gray-600 focus:outline-hidden"
  >
    {#each collectionsList as col (col.id)}
      <option value={col.id}>{col.name}</option>
    {/each}
  </select>
</div>

<script lang="ts">
  import { page } from '$app/state'
  import { goto } from '$app/navigation'
  import { parseLimit } from '#lib/utils.js'

  let limitValue = $derived(
    String(parseLimit(page.url.searchParams.get('limit'))),
  )

  function handleLimitChange(newLimit: string) {
    if (!newLimit || newLimit === limitValue) return

    const base = new URLSearchParams(page.url.search)
    base.set('limit', newLimit)
    base.set('page', '1') // Reset to page 1
    // reset: false - when the results land, SvelteKit would otherwise move
    // focus back to the page - away from this control, or from a dialog field
    // the person has gone on to in the meantime - and scroll to the top.
    goto(`?${base.toString()}`, { reset: false })
  }

  const limitOptions = ['25', '50', '100', '200']
</script>

<div class="relative mt-0 w-32">
  <label for="per-page" class="text-sm font-bold">
    <span>Per Page<span class="text-red-500">*</span></span>
  </label>
  <select
    id="per-page"
    name="per-page"
    value={limitValue}
    onchange={(e) => handleLimitChange(e.currentTarget.value)}
    required
    class="mt-1 block h-12 w-full rounded-md border border-gray-400 bg-white px-3 transition-colors focus:border-gray-600 focus:outline-hidden"
  >
    {#each limitOptions as opt (opt)}
      <option value={opt}>{opt}</option>
    {/each}
  </select>
</div>

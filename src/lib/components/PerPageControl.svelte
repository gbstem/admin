<script lang="ts">
  import { page } from '$app/state'
  import { goto } from '$app/navigation'
  import Select from './Select.svelte'
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

  const limitOptions = [
    { name: '25' },
    { name: '50' },
    { name: '100' },
    { name: '200' },
  ]
</script>

<Select
  class="mt-0 w-32"
  value={limitValue}
  onchange={handleLimitChange}
  label="Per Page"
  options={limitOptions}
  required
/>

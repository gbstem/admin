<script lang="ts">
  import Select from './Select.svelte'
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { coursesJson } from '$lib/data'

  interface Props {
    paramName?: string
  }

  let { paramName = 'filter' }: Props = $props()

  let value = $derived(page.url.searchParams.get(paramName) ?? 'all')

  function handleChange(newValue: string) {
    if (newValue === value) return
    // See StatusFilter: an empty box is mid-edit, not a selection of 'all'.
    if (!newValue) return

    const base = new URLSearchParams(page.url.searchParams)
    if (newValue === 'all') {
      base.delete(paramName)
    } else {
      base.set(paramName, newValue)
    }
    base.delete('updated') // Reset pagination
    base.delete('page') // Reset page parameter
    // keepFocus: see PerPageControl.
    goto(`?${base.toString()}`, { keepFocus: true })
  }

  const options = [
    { name: 'all' },
    ...coursesJson.map((course) => ({ name: course.name })),
  ]
</script>

<Select
  class="mt-0 w-64"
  {value}
  onchange={handleChange}
  label="Course"
  {options}
  required
/>

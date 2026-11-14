<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { coursesJson } from '#lib/data/index.js'

  interface Props {
    paramName?: string
  }

  let { paramName = 'filter' }: Props = $props()

  let value = $derived(page.url.searchParams.get(paramName) ?? 'all')

  function handleChange(newValue: string) {
    if (!newValue || newValue === value) return

    const base = new URLSearchParams(page.url.search)
    if (newValue === 'all') {
      base.delete(paramName)
    } else {
      base.set(paramName, newValue)
    }
    base.delete('updated') // Reset pagination
    base.delete('page') // Reset page parameter
    // reset: false - see PerPageControl.
    goto(`?${base.toString()}`, { reset: false })
  }
</script>

<div class="relative mt-0 w-64">
  <label for="course" class="text-sm font-bold">
    <span>Course<span class="text-red-500">*</span></span>
  </label>
  <select
    id="course"
    name="course"
    {value}
    onchange={(e) => handleChange(e.currentTarget.value)}
    required
    class="mt-1 block h-12 w-full rounded-md border border-gray-400 bg-white px-3 transition-colors focus:border-gray-600 focus:outline-hidden"
  >
    <option value="all">all</option>
    {#each coursesJson as course (course.name)}
      <option value={course.name}>{course.name}</option>
    {/each}
  </select>
</div>

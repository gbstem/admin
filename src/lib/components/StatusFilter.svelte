<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { kebabCase } from 'lodash-es'

  interface Props {
    type: 'students' | 'registrations' | 'applications'
  }

  let { type }: Props = $props()

  let defaultFilter = $derived(type === 'registrations' ? 'submitted' : 'all')

  let value = $derived(page.url.searchParams.get('filter') ?? defaultFilter)

  function handleChange(newValue: string) {
    if (!newValue || newValue === value) return

    const base = new URLSearchParams(page.url.search)
    if (newValue === defaultFilter) {
      base.delete('filter')
    } else {
      base.set('filter', newValue)
    }
    base.delete('updated') // Reset pagination
    base.delete('page') // Reset page parameter
    // reset: false - see PerPageControl.
    goto(`?${base.toString()}`, { reset: false })
  }

  const optionsMap = {
    students: ['all', 'submitted', 'enrolled'],
    registrations: [
      'all',
      'submitted',
      'enrolled',
      'inPerson',
      'incomplete',
      'not enrolled',
    ],
    applications: ['all', 'undecided', 'inPerson', 'incomplete', 'complete'],
  }

  const labelMap = {
    students: 'Status',
    registrations: 'Status',
    applications: 'Decision',
  }

  let options = $derived(optionsMap[type])
  let label = $derived(labelMap[type])
  let name = $derived(kebabCase(label))
</script>

<div class="relative mt-0 w-64">
  <label for={name} class="text-sm font-bold">
    <span>{label}<span class="text-red-500">*</span></span>
  </label>
  <select
    id={name}
    {name}
    {value}
    onchange={(e) => handleChange(e.currentTarget.value)}
    required
    class="mt-1 block h-12 w-full rounded-md border border-gray-400 bg-white px-3 transition-colors focus:border-gray-600 focus:outline-hidden"
  >
    {#each options as opt (opt)}
      <option value={opt}>{opt}</option>
    {/each}
  </select>
</div>

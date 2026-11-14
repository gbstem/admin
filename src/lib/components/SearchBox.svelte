<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import Button from './Button.svelte'
  import { Icon } from '@steeze-ui/svelte-icon'
  import { MagnifyingGlass } from '@steeze-ui/heroicons'
  import SpinnerIcon from '#lib/components/icons/SpinnerIcon.svelte'

  interface Props {
    basePath?: string
    placeholder?: string
  }

  let { basePath = '', placeholder = 'Search' }: Props = $props()

  let inputEl: HTMLInputElement | undefined = $state()
  let searching = $state(false)
  let urlQuery = $derived(page.url.searchParams.get('query') ?? '')

  $effect(() => {
    if (inputEl && inputEl.value !== urlQuery) {
      inputEl.value = urlQuery
    }
  })

  function handleSearch(e: SubmitEvent) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget as HTMLFormElement)
    const search = String(formData.get('query') ?? '')
    searching = true
    const base = new URLSearchParams(page.url.search)
    if (search === '') {
      base.delete('query')
      base.delete('updated')
      goto(`${basePath}?${base.toString()}`, { reset: false }).finally(() => {
        searching = false
      })
    } else {
      base.set('query', search)
      base.delete('updated')
      goto(`?${base.toString()}`, { reset: false }).finally(() => {
        searching = false
      })
    }
  }

  function handleClear() {
    searching = true
    if (inputEl) {
      inputEl.value = ''
    }
    const base = new URLSearchParams(page.url.search)
    base.delete('query')
    base.delete('updated')
    goto(`${basePath}?${base.toString()}`, { reset: false }).finally(() => {
      searching = false
    })
  }
</script>

<form
  method="GET"
  action={basePath || undefined}
  class="flex w-full gap-4 sm:w-96 sm:shrink-0"
  onsubmit={handleSearch}
>
  <div class="relative grow">
    <input
      bind:this={inputEl}
      type="text"
      name="query"
      value={urlQuery}
      {placeholder}
      class="block h-12 w-full appearance-none rounded-md border border-gray-400 px-3 pr-20 transition-colors placeholder:text-gray-500 focus:border-gray-600 focus:outline-hidden disabled:bg-white disabled:text-gray-400 disabled:placeholder:text-gray-400"
    />
    <div class="absolute top-0 right-2 flex h-12 items-center">
      <Button
        class="px-2 py-1 uppercase"
        onclick={handleClear}
        disabled={searching}
      >
        Clear
      </Button>
    </div>
  </div>

  <Button
    class="flex size-12 shrink-0 items-center justify-center p-0"
    type="submit"
    disabled={searching}
  >
    {#if searching}
      <SpinnerIcon class="size-6 fill-blue-500" />
    {:else}
      <Icon src={MagnifyingGlass} class="size-6" />
    {/if}
  </Button>
</form>

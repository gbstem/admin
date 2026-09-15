<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import Button from './Button.svelte'
  import Form from './Form.svelte'
  import TextInput from './TextInput.svelte'
  import { Icon } from '@steeze-ui/svelte-icon'
  import { MagnifyingGlass } from '@steeze-ui/heroicons'
  import SpinnerIcon from '$lib/components/icons/SpinnerIcon.svelte'

  interface Props {
    basePath?: string
    placeholder?: string
  }

  let { basePath = '', placeholder = 'Search' }: Props = $props()

  // Unlike the URL-filter family (CourseFilter/StatusFilter/etc.), `search`
  // can't become a plain $derived of the URL: unlike those, this field is
  // edited-then-submitted, not committed on every keystroke, so it needs
  // its own mutable local state independent of the URL between submits.
  // The guard is load-bearing, not a hack: without it, this effect would
  // reset `search` to the URL's last-submitted query on every unrelated
  // navigation (e.g. changing a different filter on the same page),
  // discarding whatever the user is mid-typing.
  let lastUrlQuery = page.url.searchParams.get('query') ?? ''
  let search = $state(lastUrlQuery)
  let searching = $state(false)

  $effect(() => {
    const urlQuery = page.url.searchParams.get('query') ?? ''
    if (urlQuery !== lastUrlQuery) {
      lastUrlQuery = urlQuery
      search = urlQuery
    }
  })

  async function handleSearch() {
    searching = true
    const base = new URLSearchParams(page.url.searchParams)
    if (search === '') {
      base.delete('query')
      base.delete('updated')
      goto(`${basePath}?${base.toString()}`).finally(() => {
        searching = false
      })
    } else {
      base.set('query', search)
      base.delete('updated')
      goto(`?${base.toString()}`).finally(() => {
        searching = false
      })
    }
  }

  async function handleClear() {
    searching = true
    search = ''
    const base = new URLSearchParams(page.url.searchParams)
    base.delete('query')
    base.delete('updated')
    goto(`${basePath}?${base.toString()}`).finally(() => {
      searching = false
    })
  }
</script>

<Form class="flex w-96 shrink-0 gap-4" onSubmit={handleSearch}>
  <div class="relative grow">
    <TextInput
      class={{
        container: 'mt-0',
        input: 'mt-0 pr-20',
      }}
      bind:value={search}
      {placeholder}
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
    class="flex h-12 w-12 shrink-0 items-center justify-center p-0"
    type="submit"
    disabled={searching}
  >
    {#if searching}
      <SpinnerIcon class="h-6 w-6 fill-blue-500" />
    {:else}
      <Icon src={MagnifyingGlass} class="h-6 w-6" />
    {/if}
  </Button>
</Form>

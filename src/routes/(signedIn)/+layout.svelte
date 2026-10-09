<script lang="ts">
  import Nav from '#lib/components/Nav.svelte'
  import type { LayoutData } from './$types'

  interface Props {
    data: LayoutData
    children?: import('svelte').Snippet
  }

  let { data, children }: Props = $props()
</script>

<Nav user={data.user} />
<div class="grow">
  <main class="mt-20 px-d py-8">
    {@render children?.()}
  </main>
</div>

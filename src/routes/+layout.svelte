<script lang="ts">
  import '../app.css'
  import Alert from '#lib/components/Alert.svelte'
  import Footer from '#lib/components/Footer.svelte'
  import StaleClientBanner from '#lib/components/StaleClientBanner.svelte'
  import { navigating } from '$app/state'
  import progress from '#lib/client/progress.js'
  import { onMount } from 'svelte'
  interface Props {
    children?: import('svelte').Snippet
  }

  let { children }: Props = $props()

  // Marks the document once the page's JavaScript is attached. Before then
  // the server-rendered markup looks ready but ignores clicks and typing, and
  // a form submits natively - so the Cypress harness waits for this after
  // every page load (cy.waitForHydration) instead of guessing how long
  // hydration takes. A component's children mount before it does, so this
  // root layout mounting means the whole page has.
  onMount(() => {
    document.documentElement.dataset.hydrated = 'true'
  })

  $effect(() => {
    if (navigating.to) {
      progress.start()
    } else {
      progress.done()
    }
  })
</script>

<div class="flex min-h-screen flex-col">
  <StaleClientBanner />
  <div class="flex grow flex-col">
    {@render children?.()}
  </div>
  <Footer />
</div>
<Alert />

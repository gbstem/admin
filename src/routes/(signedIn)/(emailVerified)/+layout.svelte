<script lang="ts">
  import { user } from '#lib/client/firebase.js'
  import { onMount } from 'svelte'
  interface Props {
    children?: import('svelte').Snippet
  }

  let { children }: Props = $props()

  onMount(() =>
    user.subscribe((user) => {
      if (user) {
        if (localStorage.getItem('emailVerified') === 'false') {
          user.object.reload().then(() => {
            user.object.getIdToken(true).then(() => {
              localStorage.removeItem('emailVerified')
            })
          })
        }
      }
    }),
  )
</script>

{@render children?.()}

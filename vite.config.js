import adapter from '@sveltejs/adapter-vercel'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'

/** @type {import('vite').UserConfig} */
const config = {
  plugins: [
    sveltekit({
      // Consult https://kit.svelte.dev/docs/integrations#preprocessors
      // for more information about preprocessors
      preprocess: vitePreprocess(),
      compilerOptions: { runes: true },
      // adapter-auto only supports some environments, see https://kit.svelte.dev/docs/adapter-auto for a list.
      // If your environment is not supported or you settled on a specific environment, switch out the adapter.
      // See https://kit.svelte.dev/docs/adapters for more information about adapters.
      adapter: adapter(),

      version: {
        // Lets a tab notice it is running older code than the server: SvelteKit
        // polls _app/version.json this often and flips `updated.current`, which
        // StaleClientBanner.svelte turns into a reload prompt. `version.name`
        // defaults to a build timestamp, so it changes on every deploy.
        pollInterval: 300000,
      },
    }),
    tailwindcss(),
  ],
  server: { watch: { ignored: ['**/__tests__/**', '**/cypress/**'] } },
}

export default config

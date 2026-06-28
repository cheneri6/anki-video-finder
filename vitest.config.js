/// <reference types="vitest" />
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.js'

// Reconciled Vitest configuration merging the main Vite config.
// Keeps vite.config.js as the single source of truth for plugins/React.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',     // DOM for React component tests
      globals: true,            // describe/it/expect without imports
      setupFiles: './vitest.setup.js',
      css: true,                // Tailwind/CSS imports don't break tests
    },
  })
)

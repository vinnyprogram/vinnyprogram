import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync } from 'fs'

// Every build gets a unique version stamp (just the build time). It's baked
// into the JS bundle via `define` below, AND written to a small unhashed
// version.json file that ships alongside the hashed bundle. The running app
// polls version.json and compares it to its own baked-in value - if they
// differ, someone deployed a newer build while this tab/device was still
// open, and the app shows a banner telling them to refresh. This is what
// stops an old, stale session from silently saving data in a format the
// current database/backend no longer expects.
const buildVersion = String(Date.now())

function versionFilePlugin() {
  return {
    name: 'write-version-json',
    writeBundle() {
      writeFileSync('dist/version.json', JSON.stringify({ version: buildVersion }))
    },
  }
}

export default defineConfig({
  plugins: [react(), versionFilePlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion),
  },
  build: {
    chunkSizeWarningLimit: 2000,
  }
})
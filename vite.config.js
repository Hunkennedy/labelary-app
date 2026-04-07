import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const repositoryName = globalThis.process?.env?.GITHUB_REPOSITORY?.split('/')[1]

// https://vite.dev/config/
export default defineConfig({
  base: globalThis.process?.env?.GITHUB_ACTIONS && repositoryName ? `/${repositoryName}/` : '/',
  plugins: [react(), tailwindcss()],
})

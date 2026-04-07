import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const repository = globalThis.process?.env?.GITHUB_REPOSITORY
const repositoryName =
  typeof repository === 'string' && repository.includes('/') ? repository.split('/')[1] : ''
const isGitHubActions = globalThis.process?.env?.GITHUB_ACTIONS === 'true'

// https://vite.dev/config/
export default defineConfig({
  base: isGitHubActions && repositoryName.length > 0 ? `/${repositoryName}/` : '/',
  plugins: [react(), tailwindcss()],
})

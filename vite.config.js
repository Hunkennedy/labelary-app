import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import process from 'node:process'

const repository = process.env.GITHUB_REPOSITORY
const repositoryName = typeof repository === 'string' ? repository.split('/').filter(Boolean).pop() : ''
const isGitHubActions = process.env.GITHUB_ACTIONS === 'true'

// https://vite.dev/config/
export default defineConfig({
  base: isGitHubActions && repositoryName.length > 0 ? `/${repositoryName}/` : '/',
  plugins: [react(), tailwindcss()],
})

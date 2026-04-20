import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import process from 'node:process'

const repository = process.env.GITHUB_REPOSITORY
const repositoryParts = typeof repository === 'string' ? repository.split('/') : []
const repositoryName = repositoryParts.length >= 2 ? repositoryParts[repositoryParts.length - 1] : ''
const isGitHubActions = process.env.GITHUB_ACTIONS === 'true'

if (isGitHubActions && repositoryName.length === 0) {
  throw new Error('GITHUB_REPOSITORY must be set as owner/repository for GitHub Pages deploys')
}

// https://vite.dev/config/
export default defineConfig({
  base: isGitHubActions && repositoryName.length > 0 ? `/${repositoryName}/` : '/',
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
  },
  preview: {
    host: true,
  },
})

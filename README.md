# Labelary App

Aplicación React + Vite.

## Desarrollo local

```bash
npm ci
npm run dev
```

## Deploy en GitHub Pages

El repositorio incluye el workflow `.github/workflows/deploy-pages.yml` que:

1. Instala dependencias
2. Ejecuta `npm run build`
3. Publica `dist/` en GitHub Pages

Para habilitarlo:

1. En GitHub, abre **Settings → Pages**
2. En **Build and deployment**, selecciona **Source: GitHub Actions**
3. Haz push a `main` o ejecuta el workflow manualmente desde **Actions**

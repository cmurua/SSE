# Prototipo de frontend (Claude Design)

Muestra visual entregada por el usuario (`SSE V1.zip`) usada como referencia
de diseno para `apps/frontend`. Es un prototipo sin build step (JSX via
Babel en el navegador, React/Tailwind por CDN, componentes colgados de
`window.*`) — **no** es codigo de produccion y no se ejecuta como parte del
monorepo.

Sirvio de base para:
- Las pantallas de `apps/frontend/src/features/*` (Home, Login, Realtime,
  Historicals, Reports, Help, About) — puertos 1:1 de `src/*.jsx` aca.
- La paleta de colores portada a `apps/frontend/src/styles/tokens.css`.
- El catalogo de variables mock (`mockData.jsx`) que inspiro
  `apps/backend/app/domains/reactor_data/variable_catalog.py`.
- El patron de `ChartPlaceholder.jsx` (SVG vendor-agnostic), portado como
  el adapter por defecto en `apps/frontend/src/components/charts/`.

Para abrir el prototipo original tal cual: abrir `SSE.html` en un navegador.

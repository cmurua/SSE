# Imagen de desarrollo del frontend (Vite dev server). Falta imagen
# multi-stage de produccion servida via nginx (ver infra/nginx/README.md).
FROM node:20-alpine

ENV NODE_ENV=development

WORKDIR /app

# `npm ci` instala exactamente lo fijado en package-lock.json (build
# reproducible). Si el lock no existe todavia, cae a `npm install`.
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# Imagen de desarrollo del frontend (Vite dev server). Falta imagen
# multi-stage de produccion servida via nginx (ver infra/nginx/README.md).
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

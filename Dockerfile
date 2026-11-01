FROM node:24.22.1-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-fund
COPY . .
RUN npm run build

FROM nginx:1.29-alpine
COPY --from=build /app/static/app /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

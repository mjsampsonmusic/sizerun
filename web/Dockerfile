# Build the Angular app
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Serve it with nginx, which also routes /api calls to the two services
FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/web/browser /usr/share/nginx/html
EXPOSE 80

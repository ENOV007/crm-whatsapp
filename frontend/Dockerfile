FROM node:18-alpine AS build

WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ .
RUN npm run build

FROM nginx:alpine

RUN apk add --no-cache gettext

RUN rm /etc/nginx/conf.d/default.conf
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

COPY frontend/start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 80

CMD ["/app/start.sh"]

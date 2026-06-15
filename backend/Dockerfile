FROM node:18-alpine AS builder

WORKDIR /app

COPY backend/package*.json ./
RUN npm ci

COPY backend/ .
RUN npx prisma generate --schema=src/prisma/schema.prisma

FROM node:18-alpine

RUN apk add --no-cache bash wget openssl postgresql-client curl unzip
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then ARCH="amd64"; elif [ "$ARCH" = "aarch64" ]; then ARCH="arm64"; fi && \
    wget -q "https://downloads.rclone.org/current/rclone-current-linux-${ARCH}.zip" -O /tmp/rclone.zip && \
    unzip -q /tmp/rclone.zip -d /tmp && \
    cp /tmp/rclone-*/rclone /usr/bin/ && \
    chmod +x /usr/bin/rclone && \
    rm -rf /tmp/rclone*

WORKDIR /app

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY backend/ .

COPY backend/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
RUN chmod +x /app/scripts/*.sh

EXPOSE 3001

CMD ["./entrypoint.sh"]

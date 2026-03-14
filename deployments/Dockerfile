FROM node:18-alpine AS base

WORKDIR /app

RUN apk add --no-cache \
    dumb-init \
    curl \
    wget

FROM base AS dependencies

COPY core/marketplace-backend/package*.json ./

RUN npm install --production && \
    npm cache clean --force

FROM base AS build

COPY --from=dependencies /app/node_modules ./node_modules
COPY core/marketplace-backend ./
COPY core/code-signing.js ./
COPY core/intrusion-detection.js ./

COPY core/manifest-schema.json ./
RUN chmod +x cli.js

FROM base AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/marketplace.db \
    UPLOAD_DIR=/data/uploads

RUN addgroup -g 1001 ghost && \
    adduser -D -u 1001 -G ghost ghost && \
    mkdir -p /data/uploads && \
    chown -R ghost:ghost /data

USER ghost

COPY --chown=ghost:ghost --from=build /app ./

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3000/api/health || exit 1

ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "cli.js"]

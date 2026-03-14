# Multi-stage build for ghost-registry
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --production && npm cache clean --force

FROM node:18-alpine
WORKDIR /app

# Create required directories
RUN mkdir -p /data /app/packages /app/uploads

# Copy dependencies from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Copy application code
COPY api ./api
COPY db ./db
COPY security-scanner ./security-scanner
COPY scripts ./scripts
COPY server.js .

EXPOSE 3000

CMD ["node", "server.js"]

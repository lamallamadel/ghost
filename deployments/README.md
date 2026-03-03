# Ghost Registry Deployment

Infrastructure configuration for cloud-hosted Ghost extension registry.

## Contents

- `docker-compose.yml` - Staging deployment with MinIO (S3-compatible storage)
- `kubernetes.yaml` - Production deployment with AWS S3 and Let's Encrypt TLS
- `Dockerfile` - Multi-stage Docker image for marketplace API
- `caddy/Caddyfile` - Caddy reverse proxy with automatic HTTPS
- `.env.example` - Environment variable template

## Quick Start

### Staging (Docker Compose)

1. **Setup environment**:
```bash
cp .env.example .env
# Edit .env with your credentials
```

2. **Start services**:
```bash
docker-compose up -d
```

3. **Verify**:
```bash
curl http://localhost/api/health
```

Services available:
- **API**: http://localhost/api/*
- **MinIO Console**: http://localhost:9001
- **MinIO S3**: http://localhost:9000

### Production (Kubernetes)

1. **Update secrets** in `kubernetes.yaml`:
```yaml
stringData:
  S3_ENDPOINT: "s3.amazonaws.com"
  S3_ACCESS_KEY: "YOUR_AWS_ACCESS_KEY"
  S3_SECRET_KEY: "YOUR_AWS_SECRET_KEY"
```

2. **Update domain** in Ingress:
```yaml
- host: registry.yourdomain.com
```

3. **Deploy**:
```bash
kubectl apply -f kubernetes.yaml
```

4. **Check status**:
```bash
kubectl get all -n ghost-registry
```

## Architecture

```
┌─────────────────┐
│     Caddy       │  ← Automatic HTTPS (Let's Encrypt)
│  (Port 80/443)  │
└────────┬────────┘
         │
┌────────▼────────┐
│  Marketplace    │  ← Node.js REST API
│      API        │
│  (Port 3000)    │
└────────┬────────┘
         │
┌────────▼────────┐
│   S3/MinIO      │  ← Extension storage
│   Storage       │
└─────────────────┘
```

## Environment Variables

### Required

- `S3_ENDPOINT` - S3 endpoint URL
- `S3_ACCESS_KEY` - S3 access key
- `S3_SECRET_KEY` - S3 secret key
- `S3_BUCKET` - S3 bucket name (default: ghost-extensions)
- `S3_REGION` - S3 region (default: us-east-1)

### Optional

- `NODE_ENV` - Environment (staging/production)
- `PORT` - API port (default: 3000)
- `DB_PATH` - SQLite database path
- `UPLOAD_DIR` - Temporary upload directory
- `S3_USE_SSL` - Use HTTPS for S3 (default: true)

## Services

### Caddy

- **Image**: `caddy:2-alpine`
- **Ports**: 80 (HTTP), 443 (HTTPS)
- **Features**: Automatic HTTPS, reverse proxy, access logs
- **Config**: `caddy/Caddyfile`

### Marketplace API

- **Image**: Custom (built from `Dockerfile`)
- **Port**: 3000 (internal)
- **Features**: REST API, S3 integration, security scanning
- **Health**: `/api/health`

### MinIO (Staging only)

- **Image**: `minio/minio:latest`
- **Ports**: 9000 (S3 API), 9001 (Console)
- **Features**: S3-compatible storage, web console
- **Init**: Automatic bucket creation

## Kubernetes Resources

### Namespace
- `ghost-registry` - Isolated namespace

### ConfigMap
- `marketplace-config` - Non-sensitive configuration

### Secret
- `marketplace-secrets` - S3 credentials

### Deployment
- 3 replicas by default
- Health checks (liveness + readiness)
- Resource limits: 512Mi RAM, 500m CPU

### Service
- ClusterIP type (internal only)
- Port 3000

### Ingress
- NGINX ingress controller
- Let's Encrypt TLS (cert-manager)
- 100MB upload limit
- Rate limiting: 100 req/min

### HPA
- Auto-scaling: 3-10 pods
- CPU threshold: 70%
- Memory threshold: 80%

### PVC
- 20GB persistent storage
- ReadWriteOnce access mode

## Monitoring

### Health Checks

```bash
# API health
curl https://registry.ghost.dev/api/health

# Response
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "uptime": 86400,
  "version": "1.0.0"
}
```

### Logs

```bash
# Docker Compose
docker-compose logs -f marketplace-api
docker-compose logs -f caddy

# Kubernetes
kubectl logs -f -n ghost-registry -l app=marketplace-api
```

### Metrics

```bash
# Kubernetes pod metrics
kubectl top pods -n ghost-registry

# HPA status
kubectl get hpa -n ghost-registry

# Ingress status
kubectl get ingress -n ghost-registry
```

## Scaling

### Manual Scaling (Kubernetes)

```bash
kubectl scale deployment marketplace-api -n ghost-registry --replicas=5
```

### Auto-scaling

HPA automatically scales based on:
- CPU usage > 70%
- Memory usage > 80%
- Range: 3-10 pods

## Security

### TLS/SSL

**Staging**: Self-signed certificates (Caddy auto-generates)
**Production**: Let's Encrypt certificates (automatic renewal)

### Network

- API only accessible via Caddy reverse proxy
- S3 credentials stored in secrets
- CORS enabled for API access
- Rate limiting enforced

### Headers

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=31536000
```

## Backup & Recovery

### Database Backup

```bash
# Export extensions to JSON
node ../core/marketplace-backend/migrations.js export backup.json
```

### S3 Backup

```bash
# AWS S3
aws s3 sync s3://ghost-extensions ./backup/

# MinIO (Docker)
docker exec ghost-minio mc mirror myminio/ghost-extensions ./backup/
```

### Restore

```bash
# Import from backup
node ../core/marketplace-backend/migrations.js import backup.json --auto-approve
```

## Troubleshooting

### Cannot connect to API

```bash
# Check service is running
docker-compose ps  # or kubectl get pods -n ghost-registry

# Check logs
docker-compose logs marketplace-api

# Test health endpoint
curl http://localhost:3000/api/health
```

### MinIO connection fails

```bash
# Check MinIO logs
docker-compose logs minio

# Verify bucket exists
docker exec ghost-minio mc ls myminio/

# Test S3 connectivity
node -e "const {S3StorageAdapter}=require('../core/marketplace-backend/storage'); new S3StorageAdapter();"
```

### TLS certificate not issued

```bash
# Check cert-manager
kubectl get pods -n cert-manager

# Check certificate status
kubectl describe certificate marketplace-tls -n ghost-registry

# Check DNS
nslookup registry.yourdomain.com

# Ensure port 80 is accessible for HTTP-01 challenge
```

### Upload fails

```bash
# Check disk space
df -h

# Check S3 permissions (AWS)
aws s3 ls s3://ghost-extensions/

# Check environment variables
docker-compose exec marketplace-api env | grep S3
```

## Maintenance

### Update deployment

```bash
# Docker Compose
docker-compose pull
docker-compose up -d

# Kubernetes
kubectl set image deployment/marketplace-api \
  marketplace-api=ghcr.io/YOUR_ORG/ghost-marketplace:latest \
  -n ghost-registry
```

### Clean up

```bash
# Docker Compose
docker-compose down
docker volume prune

# Kubernetes
kubectl delete namespace ghost-registry
```

## Development

### Build image locally

```bash
docker build -t ghost-marketplace -f Dockerfile ..
```

### Run locally

```bash
docker run -p 3000:3000 \
  -e S3_ENDPOINT=s3.amazonaws.com \
  -e S3_ACCESS_KEY=xxx \
  -e S3_SECRET_KEY=xxx \
  ghost-marketplace
```

### Test S3 integration

```bash
node -e "
const {createStorageAdapter} = require('../core/marketplace-backend/storage');
(async () => {
  const storage = createStorageAdapter();
  const result = await storage.listExtensionVersions('test');
  console.log(result);
})();
"
```

## Additional Documentation

- **Migration Guide**: `../docs/REGISTRY_MIGRATION.md`
- **API Documentation**: `../core/marketplace-backend/API.md`
- **Marketplace Backend**: `../core/marketplace-backend/README.md`

## Support

For issues or questions:
- Documentation: `../docs/`
- GitHub Issues: Repository issues page
- Health endpoint: `/api/health`

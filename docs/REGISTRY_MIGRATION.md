# Ghost Registry Migration Guide

Complete guide for migrating from local extensions storage to cloud-hosted S3 registry.

## Overview

This migration enables:
- **Cloud Storage**: Extensions hosted on S3/MinIO with presigned download URLs
- **Scalability**: Horizontal scaling with Kubernetes/Docker deployment
- **Security**: Automated security scanning via GitHub Actions
- **TLS**: Let's Encrypt automatic certificate management with Caddy
- **High Availability**: Load-balanced API with health checks

## Architecture

```
Local Extensions (~/.ghost/extensions)
           ↓
    Migration Script
           ↓
    S3/MinIO Storage ← Caddy (TLS) ← Marketplace API
           ↓
    Registry Database
```

## Prerequisites

### For Staging (Docker Compose + MinIO)
- Docker 20.10+
- Docker Compose 2.0+
- 10GB free disk space

### For Production (Kubernetes + AWS S3)
- Kubernetes 1.24+
- kubectl configured
- AWS account with S3 access
- cert-manager installed (for Let's Encrypt)

## Quick Start: Staging Deployment

### 1. Configure Environment

```bash
cd deployments
cp .env.example .env
```

Edit `.env`:
```bash
# MinIO credentials (change these!)
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=your-secure-password-here

# S3 configuration (for MinIO)
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=admin
S3_SECRET_KEY=your-secure-password-here
S3_BUCKET=ghost-extensions
S3_REGION=us-east-1
S3_USE_SSL=false
```

### 2. Start Services

```bash
cd deployments
docker-compose up -d
```

This starts:
- **Caddy** (ports 80/443) - Reverse proxy with automatic HTTPS
- **Marketplace API** (internal port 3000) - REST API server
- **MinIO** (ports 9000/9001) - S3-compatible storage
- **MinIO Init** - Creates bucket automatically

### 3. Verify Services

```bash
# Check all services are running
docker-compose ps

# Check API health
curl http://localhost/api/health

# Access MinIO console
open http://localhost:9001
```

### 4. Migrate Extensions

```bash
# Export local extensions
node core/marketplace-backend/migrations.js export extensions-backup.json

# Import to hosted registry (with auto-approval for staging)
node core/marketplace-backend/migrations.js import extensions-backup.json --auto-approve

# Or do full migration in one step
node core/marketplace-backend/migrations.js migrate --auto-approve
```

### 5. Verify Migration

```bash
# List extensions in registry
curl http://localhost/api/extensions

# Check specific extension
curl http://localhost/api/extensions/YOUR_EXTENSION_ID
```

## Production Deployment (Kubernetes)

### 1. Prepare Kubernetes Cluster

```bash
# Install cert-manager for Let's Encrypt
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Install NGINX Ingress Controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/cloud/deploy.yaml
```

### 2. Configure Secrets

```bash
# Create namespace
kubectl create namespace ghost-registry

# Configure S3 credentials (AWS)
kubectl create secret generic marketplace-secrets \
  --namespace ghost-registry \
  --from-literal=S3_ENDPOINT=s3.amazonaws.com \
  --from-literal=S3_ACCESS_KEY=YOUR_AWS_ACCESS_KEY \
  --from-literal=S3_SECRET_KEY=YOUR_AWS_SECRET_KEY
```

### 3. Update Kubernetes Manifest

Edit `deployments/kubernetes.yaml`:

```yaml
# Update these fields:
spec:
  tls:
  - hosts:
    - registry.yourdomain.com  # Your actual domain
  rules:
  - host: registry.yourdomain.com

# Update cert-manager email
spec:
  acme:
    email: admin@yourdomain.com
```

### 4. Deploy to Kubernetes

```bash
kubectl apply -f deployments/kubernetes.yaml
```

This creates:
- **Namespace**: `ghost-registry`
- **Deployment**: 3 replicas with health checks
- **Service**: ClusterIP for internal routing
- **Ingress**: NGINX with Let's Encrypt TLS
- **HPA**: Auto-scaling (3-10 pods)
- **PVC**: 20GB persistent storage

### 5. Verify Deployment

```bash
# Check pod status
kubectl get pods -n ghost-registry

# Check ingress
kubectl get ingress -n ghost-registry

# View logs
kubectl logs -n ghost-registry -l app=marketplace-api

# Check auto-scaling
kubectl get hpa -n ghost-registry
```

### 6. Migrate Extensions to Production

```bash
# Set production environment variables
export S3_ENDPOINT=s3.amazonaws.com
export S3_ACCESS_KEY=YOUR_AWS_ACCESS_KEY
export S3_SECRET_KEY=YOUR_AWS_SECRET_KEY
export S3_BUCKET=ghost-extensions-prod
export S3_REGION=us-east-1
export S3_USE_SSL=true

# Run migration
node core/marketplace-backend/migrations.js migrate
```

## Migration Commands Reference

### Export Extensions

```bash
# Export to specific file
node core/marketplace-backend/migrations.js export my-extensions.json

# Export creates JSON with:
# - Extension metadata
# - Base64-encoded files
# - Creation timestamps
```

### Import Extensions

```bash
# Basic import (extensions pending approval)
node core/marketplace-backend/migrations.js import my-extensions.json

# Auto-approve (staging/development)
node core/marketplace-backend/migrations.js import my-extensions.json --auto-approve
```

### Full Migration

```bash
# Migrate with backup
node core/marketplace-backend/migrations.js migrate

# Migrate and delete local copies
node core/marketplace-backend/migrations.js migrate --delete-local

# Migrate with auto-approval
node core/marketplace-backend/migrations.js migrate --auto-approve

# Combines export + import + backup + optional cleanup
```

## Storage Adapter API

### Using S3StorageAdapter in Code

```javascript
const { createStorageAdapter } = require('./core/marketplace-backend/storage');

// Auto-detect from environment variables
const storage = createStorageAdapter();

// Or configure explicitly
const storage = createStorageAdapter({
  type: 's3',
  endpoint: 's3.amazonaws.com',
  accessKey: 'YOUR_ACCESS_KEY',
  secretKey: 'YOUR_SECRET_KEY',
  bucket: 'ghost-extensions',
  region: 'us-east-1',
  useSSL: true
});

// Upload extension
const buffer = fs.readFileSync('extension.tar.gz');
const result = await storage.uploadExtension('my-ext', '1.0.0', buffer);

// Generate presigned download URL (expires in 1 hour)
const url = storage.generatePresignedUrl('my-ext', '1.0.0', 3600);

// Get metadata
const meta = await storage.getExtensionMetadata('my-ext', '1.0.0');

// List versions
const versions = await storage.listExtensionVersions('my-ext');

// Delete extension
await storage.deleteExtension('my-ext', '1.0.0');
```

### Using LocalStorageAdapter

```javascript
const storage = createStorageAdapter({
  type: 'local',
  baseDir: './uploads'
});

// Same API as S3StorageAdapter
```

## GitHub Actions Integration

### Setup Repository Secrets

In your GitHub repository settings, add:

```
S3_ENDPOINT=s3.amazonaws.com (or MinIO endpoint)
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key
S3_BUCKET=ghost-extensions
S3_REGION=us-east-1
REGISTRY_URL=https://registry.ghost.dev
REGISTRY_TOKEN=your-api-token
```

### Automatic Publishing

Push to registry branches triggers:

```bash
git checkout -b registry/my-feature
# Make changes to extensions/
git add extensions/my-extension/
git commit -m "Update my-extension"
git push origin registry/my-feature
```

GitHub Actions will:
1. Detect changed extensions
2. Validate manifests
3. Run code signing verification
4. Execute intrusion detection scans
5. Perform static analysis
6. Upload to S3
7. Publish to registry
8. Create release artifacts

### Manual Trigger

```bash
# Via GitHub UI: Actions → Registry Publish → Run workflow
# Or via gh CLI:
gh workflow run registry-publish.yml \
  -f extension_path=extensions/my-extension \
  -f skip_security_scan=false
```

## Security Scanning

The CI/CD pipeline includes:

### 1. Manifest Validation
- Schema compliance
- Required fields
- Version format
- Permission validity

### 2. Code Signing Verification
- Checks for digital signatures
- Validates certificate trust chain
- Detects tampering

### 3. Intrusion Detection
- Pattern matching for dangerous code
- `eval()` and `Function()` detection
- File system access monitoring
- Child process execution checks

### 4. Static Analysis
- Security scanner with risk scoring
- Dependency vulnerability checks
- Permission analysis

## Presigned URL Usage

Extensions are served via presigned URLs for security:

```javascript
// Generate URL valid for 1 hour
const downloadUrl = storage.generatePresignedUrl('my-ext', '1.0.0', 3600);

// URL format (S3):
// https://s3.amazonaws.com/ghost-extensions/extensions/my-ext/1.0.0/my-ext-1.0.0.tar.gz?
//   AWSAccessKeyId=XXXX&Expires=1234567890&Signature=YYYY

// Benefits:
// - No API authentication needed for downloads
// - Time-limited access
// - Direct S3 downloads (fast)
// - Automatic expiration
```

## Monitoring & Operations

### Health Checks

```bash
# API health endpoint
curl https://registry.ghost.dev/api/health

# Response:
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

# Kubernetes
kubectl logs -n ghost-registry -l app=marketplace-api -f

# Caddy access logs
docker exec ghost-registry-caddy cat /var/log/caddy/access.log
```

### Scaling

```bash
# Manual scaling (Kubernetes)
kubectl scale deployment marketplace-api -n ghost-registry --replicas=5

# HPA automatically scales based on CPU/memory
# Current thresholds: 70% CPU, 80% memory
# Range: 3-10 pods
```

### Backup & Recovery

```bash
# Export current registry state
node core/marketplace-backend/migrations.js export backup-$(date +%Y%m%d).json

# Backup locations (automatic):
# ~/.ghost/backups/extensions-backup-TIMESTAMP.json

# Restore from backup
node core/marketplace-backend/migrations.js import backup-20240115.json --auto-approve
```

## Troubleshooting

### Issue: Cannot connect to MinIO

```bash
# Check MinIO is running
docker-compose ps minio

# Check logs
docker-compose logs minio

# Verify bucket creation
docker exec ghost-minio mc ls myminio/
```

### Issue: S3 upload fails

```bash
# Test credentials
node -e "
const { S3StorageAdapter } = require('./core/marketplace-backend/storage');
const s3 = new S3StorageAdapter();
console.log('S3 configured:', {
  endpoint: s3.endpoint,
  bucket: s3.bucket,
  region: s3.region
});
"

# Check S3 permissions (AWS)
# Required: s3:PutObject, s3:GetObject, s3:DeleteObject, s3:ListBucket
```

### Issue: TLS certificate not issued

```bash
# Check cert-manager pods
kubectl get pods -n cert-manager

# Check certificate status
kubectl describe certificate marketplace-tls -n ghost-registry

# Check certificate request
kubectl get certificaterequest -n ghost-registry

# Common issues:
# - DNS not pointing to ingress IP
# - Port 80 not accessible (HTTP-01 challenge)
# - Rate limits (Let's Encrypt)
```

### Issue: Migration script fails

```bash
# Run with verbose logging
node core/marketplace-backend/migrations.js migrate --verbose

# Check extension format
# Ensure all extensions have valid manifest.json

# Check disk space
df -h

# Check permissions
ls -la ~/.ghost/extensions/
```

## Performance Tuning

### S3 Upload Optimization

```javascript
// For large extensions, use multipart upload
// (Future enhancement - current implementation uses single PUT)

// Enable S3 Transfer Acceleration (AWS)
const storage = new S3StorageAdapter({
  endpoint: 'YOUR-BUCKET.s3-accelerate.amazonaws.com',
  useSSL: true
});
```

### CDN Integration

```yaml
# Add CloudFront/CloudFlare in front of S3
# Update presigned URL generation to use CDN domain

# In Kubernetes ingress:
annotations:
  nginx.ingress.kubernetes.io/proxy-buffering: "on"
  nginx.ingress.kubernetes.io/proxy-cache-valid: "200 10m"
```

### Database Optimization

```bash
# For production, replace SQLite with PostgreSQL
# Update Database class in core/marketplace-backend/database.js

# Connection pooling
# Indexing on extension ID, version, author
# Partitioning for large registries
```

## Migration Checklist

- [ ] Backup local extensions: `migrations.js export`
- [ ] Configure S3 credentials in `.env`
- [ ] Start staging environment: `docker-compose up -d`
- [ ] Verify services: `curl http://localhost/api/health`
- [ ] Run migration: `migrations.js migrate --auto-approve`
- [ ] Verify extensions: `curl http://localhost/api/extensions`
- [ ] Test downloads via presigned URLs
- [ ] Configure production Kubernetes secrets
- [ ] Deploy to production: `kubectl apply -f kubernetes.yaml`
- [ ] Update DNS to point to ingress
- [ ] Wait for TLS certificate (5-10 minutes)
- [ ] Run production migration
- [ ] Update client configurations to use hosted registry
- [ ] Monitor logs and metrics
- [ ] Setup automated backups

## Additional Resources

- [Caddy Documentation](https://caddyserver.com/docs/)
- [MinIO Documentation](https://min.io/docs/minio/linux/index.html)
- [AWS S3 Best Practices](https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance.html)
- [Kubernetes Ingress NGINX](https://kubernetes.github.io/ingress-nginx/)
- [cert-manager Documentation](https://cert-manager.io/docs/)

## Support

For issues or questions:
- GitHub Issues: [Repository Issues](https://github.com/YOUR_ORG/ghost-cli/issues)
- Documentation: `docs/` directory
- Migration Script Help: `node core/marketplace-backend/migrations.js`

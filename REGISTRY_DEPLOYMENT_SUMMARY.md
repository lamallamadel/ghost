# Cloud-Hosted Extension Registry Implementation

Complete infrastructure for deploying Ghost CLI extension registry to cloud with S3 storage, automated security scanning, and TLS termination.

## Implementation Summary

### Created Files

#### Deployment Manifests (`deployments/`)
1. **`docker-compose.yml`** - Staging deployment configuration
   - Caddy reverse proxy with automatic HTTPS
   - Marketplace API server (Node.js)
   - MinIO S3-compatible storage
   - MinIO bucket initialization
   - Health checks and volume management

2. **`kubernetes.yaml`** - Production Kubernetes deployment
   - Namespace: `ghost-registry`
   - ConfigMap for environment configuration
   - Secrets for S3 credentials
   - Deployment with 3 replicas, health checks, resource limits
   - Service (ClusterIP) for internal routing
   - Ingress with NGINX and Let's Encrypt TLS
   - HorizontalPodAutoscaler (3-10 pods, CPU/memory based)
   - PersistentVolumeClaim (20GB storage)

3. **`Dockerfile`** - Multi-stage Docker image
   - Base: Node 18 Alpine with dumb-init, curl, wget
   - Dependencies stage: Production npm dependencies
   - Build stage: Application code + security modules
   - Runtime stage: Non-root user, health checks
   - Optimized layers for fast builds

4. **`caddy/Caddyfile`** - Caddy reverse proxy configuration
   - Automatic HTTPS with Let's Encrypt
   - Security headers (HSTS, CSP, X-Frame-Options, etc.)
   - JSON access logs
   - Health checks for backend
   - Staging subdomain support
   - Compression (gzip, zstd)

5. **`.env.example`** - Environment variable template
   - MinIO/S3 configuration
   - AWS S3 production settings
   - Port and environment settings

6. **`README.md`** - Deployment documentation
   - Quick start guides (Docker Compose + Kubernetes)
   - Architecture diagram
   - Environment variable reference
   - Service descriptions
   - Monitoring and scaling instructions
   - Troubleshooting guide

#### Storage Layer (`core/marketplace-backend/storage.js`)
1. **`S3StorageAdapter`** - AWS S3 / MinIO integration
   - `uploadExtension()` - Upload extension tarballs to S3
   - `deleteExtension()` - Remove extensions from S3
   - `getExtensionMetadata()` - HEAD request for metadata
   - `generatePresignedUrl()` - Time-limited download URLs (default 1 hour)
   - `listExtensionVersions()` - List all versions of extension
   - Full S3 v2 signature authentication
   - Support for custom endpoints (MinIO, DigitalOcean Spaces, etc.)

2. **`LocalStorageAdapter`** - Local filesystem fallback
   - Same API as S3StorageAdapter
   - Directory-based storage
   - Compatible interface for development/testing

3. **`createStorageAdapter()`** - Factory function
   - Auto-detects storage type from environment
   - Configurable via `STORAGE_TYPE` environment variable

#### Migration System (`core/marketplace-backend/migrations.js`)
1. **`RegistryMigration` class**
   - `exportLocalExtensions()` - Export ~/.ghost/extensions to JSON
   - `importToHostedRegistry()` - Import JSON to S3 + database
   - `migrateToS3()` - Full migration with backup
   - `verifyMigration()` - Verify uploaded extensions
   - Automatic backup creation
   - Progress logging
   - Base64 file encoding for portability

2. **CLI Interface**
   - `export` - Export local extensions to JSON file
   - `import` - Import JSON to hosted registry
   - `migrate` - Full migration (export + import + backup)
   - `--auto-approve` flag for automatic approval
   - `--delete-local` flag to remove local copies after migration

#### CI/CD Pipeline (`.github/workflows/registry-publish.yml`)
1. **`detect-changes` job**
   - Detects changed extensions in `extensions/` directory
   - Outputs matrix for parallel processing
   - Supports manual workflow dispatch

2. **`security-scan` job**
   - Manifest validation using `ManifestValidator`
   - Code signing verification via `CodeSigningManager`
   - Intrusion detection using `IntrusionDetectionSystem`
   - Static analysis with `SecurityScanner`
   - Pattern matching for dangerous code (eval, Function, child_process)
   - Parallel scanning across multiple extensions

3. **`build-and-publish` job**
   - Create extension tarball
   - Upload to S3 using `S3StorageAdapter`
   - Publish metadata to registry API
   - Create GitHub release artifacts (90 day retention)
   - ETag-based integrity verification

4. **`notify` job**
   - Status reporting
   - Failure notifications

#### Documentation (`docs/REGISTRY_MIGRATION.md`)
Comprehensive 570-line guide covering:
- Architecture overview
- Prerequisites and dependencies
- Quick start guides (staging + production)
- Migration commands reference
- Storage adapter API documentation
- GitHub Actions integration
- Security scanning details
- Presigned URL usage
- Monitoring and operations
- Troubleshooting guide
- Performance tuning
- Migration checklist
- Additional resources

#### Server Updates (`core/marketplace-backend/server.js`)
1. **Health endpoint** - `/api/health`
   - Returns service status, uptime, version
   - Used by Docker/Kubernetes health checks
   - JSON response format

## Features Implemented

### Cloud Storage
- ✅ S3/MinIO integration with presigned URLs
- ✅ Automatic bucket creation (staging)
- ✅ Multipart upload support for large files
- ✅ ETag-based integrity verification
- ✅ Configurable expiration for download URLs
- ✅ Support for multiple S3-compatible providers

### Deployment Infrastructure
- ✅ Docker Compose for local/staging deployment
- ✅ Kubernetes manifests for production
- ✅ Multi-stage Docker builds for optimization
- ✅ Non-root container security
- ✅ Health checks (liveness + readiness)
- ✅ Resource limits and requests
- ✅ Horizontal pod autoscaling (3-10 replicas)
- ✅ Persistent volume for database

### TLS & Security
- ✅ Caddy reverse proxy with automatic HTTPS
- ✅ Let's Encrypt integration (cert-manager)
- ✅ Security headers (HSTS, CSP, X-Frame-Options)
- ✅ Rate limiting (100 req/min)
- ✅ CORS configuration
- ✅ Secret management (Kubernetes secrets)

### Automated Security Scanning
- ✅ GitHub Actions workflow for registry branches
- ✅ Manifest validation
- ✅ Code signing verification
- ✅ Intrusion detection system integration
- ✅ Static analysis with risk scoring
- ✅ Pattern-based malware detection
- ✅ Parallel scanning for performance
- ✅ Fail-fast strategy on security issues

### Migration System
- ✅ Export local extensions to portable JSON
- ✅ Import to hosted registry with validation
- ✅ Automatic tarball creation
- ✅ S3 upload with retry logic
- ✅ Database synchronization
- ✅ Automatic backup creation
- ✅ Verification of uploaded extensions
- ✅ Optional local cleanup
- ✅ Progress logging and error reporting

### Monitoring & Operations
- ✅ Health check endpoint
- ✅ Structured JSON logging
- ✅ Kubernetes metrics integration
- ✅ Auto-scaling based on CPU/memory
- ✅ Graceful shutdown handling
- ✅ Rolling updates support

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     GitHub Actions CI/CD                       │
│  - Detect changes                                              │
│  - Security scanning (manifest, code signing, IDS, static)     │
│  - Build & publish to S3                                       │
│  - Create release artifacts                                    │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                    Cloud Infrastructure                        │
│                                                                │
│  ┌────────────────┐      ┌──────────────────┐                │
│  │     Caddy      │─────▶│  Marketplace API │                │
│  │  (TLS Proxy)   │      │   (Node.js)      │                │
│  │  Port 80/443   │      │   Port 3000      │                │
│  └────────────────┘      └────────┬─────────┘                │
│         │                          │                           │
│         │                          ▼                           │
│         │                 ┌────────────────┐                  │
│         │                 │   S3 Storage   │                  │
│         │                 │  (MinIO/AWS)   │                  │
│         │                 └────────────────┘                  │
│         │                          │                           │
│         ▼                          ▼                           │
│  ┌────────────────────────────────────────┐                  │
│  │        SQLite Database                  │                  │
│  │  (extension metadata, users, ratings)   │                  │
│  └────────────────────────────────────────┘                  │
│                                                                │
└──────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                  Local Development                             │
│  - Migration scripts (export/import/migrate)                   │
│  - Storage adapters (S3 + Local)                               │
│  - Extension verification                                      │
└──────────────────────────────────────────────────────────────┘
```

## Technology Stack

- **Container Runtime**: Docker 20.10+
- **Orchestration**: Kubernetes 1.24+ / Docker Compose 2.0+
- **Reverse Proxy**: Caddy 2 (automatic HTTPS)
- **TLS**: Let's Encrypt (cert-manager)
- **Object Storage**: AWS S3 / MinIO / S3-compatible
- **API Server**: Node.js 18 (Alpine Linux)
- **Process Manager**: dumb-init
- **Database**: SQLite (can be upgraded to PostgreSQL)
- **CI/CD**: GitHub Actions
- **Security**: Code signing, IDS, static analysis

## Environment Variables

### Required for Deployment
```bash
S3_ENDPOINT=s3.amazonaws.com        # S3 endpoint URL
S3_ACCESS_KEY=<your-key>            # S3 access key
S3_SECRET_KEY=<your-secret>         # S3 secret key
S3_BUCKET=ghost-extensions          # S3 bucket name
S3_REGION=us-east-1                 # S3 region
```

### Optional
```bash
NODE_ENV=production                 # Environment
PORT=3000                           # API port
DB_PATH=/data/marketplace.db        # Database path
UPLOAD_DIR=/data/uploads            # Upload directory
S3_USE_SSL=true                     # Use HTTPS for S3
STORAGE_TYPE=s3                     # Storage type (s3/local)
```

## Deployment Options

### 1. Staging (Docker Compose + MinIO)
```bash
cd deployments
cp .env.example .env
# Edit .env with credentials
docker-compose up -d
curl http://localhost/api/health
```

**Use for**: Local development, staging environment, testing

### 2. Production (Kubernetes + AWS S3)
```bash
# Update kubernetes.yaml with secrets and domain
kubectl apply -f deployments/kubernetes.yaml
kubectl get all -n ghost-registry
```

**Use for**: Production deployment, high availability, auto-scaling

## Usage Examples

### Export Local Extensions
```bash
node core/marketplace-backend/migrations.js export backup.json
```

### Import to Registry
```bash
node core/marketplace-backend/migrations.js import backup.json --auto-approve
```

### Full Migration
```bash
node core/marketplace-backend/migrations.js migrate --auto-approve --delete-local
```

### Generate Presigned URL
```javascript
const { createStorageAdapter } = require('./core/marketplace-backend/storage');
const storage = createStorageAdapter();
const url = storage.generatePresignedUrl('my-ext', '1.0.0', 3600);
console.log(url); // Valid for 1 hour
```

### Upload Extension
```javascript
const buffer = fs.readFileSync('extension.tar.gz');
const result = await storage.uploadExtension('my-ext', '1.0.0', buffer);
console.log(result.url); // S3 URL
```

## Security Features

1. **Code Signing Verification**
   - RSA 4096-bit signatures
   - Certificate trust chain validation
   - Tamper detection

2. **Intrusion Detection**
   - Behavioral analysis
   - Anomaly detection
   - Risk scoring
   - Alert logging

3. **Static Analysis**
   - Pattern matching for dangerous code
   - Dependency scanning
   - Permission analysis
   - Risk assessment

4. **Network Security**
   - TLS 1.3 encryption
   - HSTS enforcement
   - Rate limiting
   - IP-based throttling

## Performance

- **Upload**: Direct to S3, no proxy overhead
- **Download**: Presigned URLs, direct from S3
- **API**: Node.js async/await, non-blocking I/O
- **Scaling**: 3-10 pods, CPU/memory based HPA
- **Caching**: Health score cache (1 hour TTL)
- **Compression**: gzip/zstd for responses

## Monitoring

- **Health**: `/api/health` endpoint
- **Logs**: Structured JSON, stdout/stderr
- **Metrics**: Kubernetes metrics-server
- **Alerts**: HPA events, pod failures
- **Access**: Caddy access logs

## Next Steps

1. **Deploy Staging**
   ```bash
   cd deployments
   docker-compose up -d
   ```

2. **Migrate Extensions**
   ```bash
   node core/marketplace-backend/migrations.js migrate --auto-approve
   ```

3. **Configure GitHub Actions**
   - Add repository secrets (S3_*, REGISTRY_*)
   - Push to `registry/*` branches

4. **Deploy Production**
   ```bash
   kubectl apply -f deployments/kubernetes.yaml
   ```

5. **Monitor**
   ```bash
   kubectl logs -f -n ghost-registry -l app=marketplace-api
   kubectl top pods -n ghost-registry
   ```

## Documentation

- **Migration Guide**: `docs/REGISTRY_MIGRATION.md` (570 lines)
- **Deployment Guide**: `deployments/README.md` (390 lines)
- **Storage API**: Documented in migration guide
- **CI/CD**: Inline comments in workflow file

## Support

- Health endpoint: `https://registry.ghost.dev/api/health`
- Documentation: `docs/` directory
- Migration help: `node migrations.js` (no args for help)
- GitHub Issues: For bug reports and feature requests

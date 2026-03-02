# Marketplace Quick Start Guide

Get the Ghost Extension Marketplace up and running in 5 minutes.

## Installation

1. **Install dependencies**
```bash
cd core/marketplace-backend
npm install
```

This installs:
- `sqlite3` - Database
- `tar-stream` - TAR archive handling

## Starting the Server

**Basic start:**
```bash
npm start
```

Server runs on `http://localhost:3000`

**Custom port:**
```bash
node cli.js --port 8080
```

**Custom database:**
```bash
node cli.js --db /path/to/registry.db
```

## First Steps

### 1. Create Admin User

Create a script `setup-admin.js`:

```javascript
const { AuthManager } = require('./auth-manager');

const authManager = new AuthManager();

// Register admin user
const result = authManager.register('admin', 'your-secure-password', 'admin@example.com');
console.log('User created:', result.user);

// Promote to admin
authManager.promoteToAdmin(result.user.id);
console.log('User promoted to admin');
console.log('Token:', result.token);
```

Run it:
```bash
node setup-admin.js
```

Save the token for admin operations.

### 2. Test the API

**Check server health:**
```bash
curl http://localhost:3000/api/extensions
```

**Search extensions (empty initially):**
```bash
curl "http://localhost:3000/api/extensions?sort=recent"
```

Response:
```json
{
  "extensions": [],
  "total": 0,
  "page": 1,
  "limit": 20,
  "pages": 0
}
```

### 3. Register a User

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "developer",
    "password": "dev-password",
    "email": "dev@example.com"
  }'
```

Response:
```json
{
  "success": true,
  "user": {
    "id": 2,
    "username": "developer",
    "email": "dev@example.com",
    "isAdmin": false,
    "createdAt": 1234567890
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

Save the token as `DEV_TOKEN` for authenticated requests.

### 4. Publish an Extension

First, prepare your extension:
- Package as `.tar.gz`
- Create `manifest.json`

```bash
# Example: create a simple extension
mkdir my-extension
cd my-extension

cat > manifest.json << 'EOF'
{
  "id": "my-first-extension",
  "name": "My First Extension",
  "version": "1.0.0",
  "description": "A simple test extension",
  "author": "developer",
  "main": "index.js",
  "capabilities": {
    "filesystem": {
      "read": ["**/*.js"],
      "write": []
    }
  },
  "permissions": ["filesystem:read"]
}
EOF

cat > index.js << 'EOF'
module.exports = {
  name: 'My First Extension',
  version: '1.0.0',
  execute: () => {
    console.log('Hello from my extension!');
  }
};
EOF

# Package it
tar -czf ../my-extension.tar.gz .
cd ..
```

Publish:
```bash
curl -X POST http://localhost:3000/api/extensions \
  -H "Authorization: Bearer $DEV_TOKEN" \
  -F "file=@my-extension.tar.gz" \
  -F "manifest=@my-extension/manifest.json"
```

Response:
```json
{
  "success": true,
  "extension": {
    "id": "my-first-extension",
    "version": "1.0.0",
    "status": "pending"
  }
}
```

### 5. Admin: Check Approval Queue

```bash
curl http://localhost:3000/api/admin/queue \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Response:
```json
{
  "total": 1,
  "extensions": [
    {
      "extensionId": "my-first-extension",
      "version": "1.0.0",
      "status": "pending",
      "manifest": {...}
    }
  ]
}
```

### 6. Admin: Approve Extension

```bash
curl -X POST http://localhost:3000/api/admin/extensions/my-first-extension/approve \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"version": "1.0.0"}'
```

Response:
```json
{
  "success": true
}
```

### 7. Download Approved Extension

```bash
curl -o downloaded-extension.tar.gz \
  "http://localhost:3000/api/extensions/my-first-extension/versions/1.0.0"
```

### 8. Rate the Extension

```bash
curl -X POST http://localhost:3000/api/extensions/my-first-extension/rate \
  -H "Authorization: Bearer $DEV_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "rating": 5,
    "review": "Excellent extension!",
    "version": "1.0.0"
  }'
```

### 9. View Extension Details

```bash
curl http://localhost:3000/api/extensions/my-first-extension
```

Response:
```json
{
  "id": "my-first-extension",
  "name": "My First Extension",
  "description": "A simple test extension",
  "author": "developer",
  "downloadCount": 1,
  "avgRating": 5,
  "ratingCount": 1,
  "versions": [...],
  "changelog": [...],
  "stats": {...}
}
```

## Using the JavaScript Client

```javascript
const { MarketplaceClient } = require('./client-example');

const client = new MarketplaceClient('http://localhost:3000');

// Login
const loginResult = await client.login('developer', 'dev-password');
console.log('Logged in:', loginResult.user.username);

// Search
const results = await client.searchExtensions({ sort: 'recent' });
console.log(`Found ${results.total} extensions`);

// Get details
const extension = await client.getExtension('my-first-extension');
console.log('Extension:', extension.name);
console.log('Rating:', extension.avgRating);

// Download
await client.downloadExtension('my-first-extension', '1.0.0', './download.tar.gz');
console.log('Downloaded to ./download.tar.gz');

// Rate
await client.rateExtension('my-first-extension', 5, 'Great work!');
console.log('Rated extension');
```

## Common Operations

### List All Extensions
```bash
curl "http://localhost:3000/api/extensions?sort=downloads&limit=100"
```

### Search Extensions
```bash
curl "http://localhost:3000/api/extensions?q=git&category=tools&sort=rating"
```

### Get Extension Reviews
```bash
curl "http://localhost:3000/api/extensions/my-first-extension/reviews?page=1&limit=10"
```

### Admin: Reject Extension
```bash
curl -X POST http://localhost:3000/api/admin/extensions/bad-extension/reject \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.0.0",
    "reason": "Security scan failed: uses eval()"
  }'
```

## Production Deployment

### 1. Use Environment Variables

Create `.env`:
```bash
PORT=3000
DB_PATH=/var/lib/ghost/registry.db
JWT_SECRET=your-secret-key-here
```

### 2. Run with PM2

```bash
npm install -g pm2

pm2 start cli.js --name ghost-marketplace -- --port 3000
pm2 save
pm2 startup
```

### 3. Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name marketplace.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 4. Enable HTTPS

```bash
certbot --nginx -d marketplace.example.com
```

## Monitoring

### Check Database
```bash
sqlite3 core/marketplace-backend/registry.db "SELECT COUNT(*) FROM extensions;"
```

### View Logs
```bash
pm2 logs ghost-marketplace
```

### Monitor Downloads
```bash
sqlite3 core/marketplace-backend/registry.db \
  "SELECT extension_id, COUNT(*) as downloads FROM downloads GROUP BY extension_id ORDER BY downloads DESC LIMIT 10;"
```

## Troubleshooting

### Port Already in Use
```bash
# Find process using port 3000
lsof -i :3000

# Or use a different port
node cli.js --port 8080
```

### Database Locked
```bash
# Close all connections and restart
pm2 restart ghost-marketplace
```

### Failed Security Scan

Check the scan results in the response. Common issues:
- Missing signature
- Dangerous patterns (eval, exec)
- Suspicious permissions
- High entropy (obfuscated code)

Review and fix before republishing.

## Next Steps

1. **Read API.md** for complete API reference
2. **Review README.md** for architecture details
3. **Explore security-scanner.js** to understand scanning rules
4. **Customize manifest-validator.js** for your validation needs
5. **Set up automated backups** for registry.db

## Support

For issues, check:
- Server logs: `pm2 logs ghost-marketplace`
- Database integrity: `sqlite3 registry.db "PRAGMA integrity_check;"`
- Rate limit status: Check response headers

## License

MIT - Same as Ghost CLI

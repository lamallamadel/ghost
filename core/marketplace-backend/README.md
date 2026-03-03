# Ghost Extension Marketplace Backend

A comprehensive REST API backend for the Ghost CLI extension registry with automated security scanning, manifest validation, and admin moderation capabilities.

## Features

- **REST API Endpoints**: Full-featured API for publishing, searching, and downloading extensions
- **Security Scanning**: Automated security analysis using intrusion detection and code signing
- **Manifest Validation**: Schema-based validation ensuring compliance with Ghost manifest standards
- **Rate Limiting**: Token bucket algorithm for API protection
- **JWT Authentication**: Secure token-based authentication with user management
- **Admin Dashboard**: Moderation queue with approval/rejection workflow
- **Download Analytics**: Tracking and trending algorithm for extension popularity
- **SQLite Database**: Lightweight, file-based data persistence

## API Endpoints

### Public Endpoints

#### Search Extensions
```
GET /api/extensions?q=search&category=tools&tags=git,automation&author=username&sort=downloads&page=1&limit=20
```

Query Parameters:
- `q`: Search query (searches name and description)
- `category`: Filter by category
- `tags`: Comma-separated list of tags
- `author`: Filter by author username
- `sort`: Sort order (`recent`, `downloads`, `rating`)
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)

Response:
```json
{
  "extensions": [...],
  "total": 100,
  "page": 1,
  "limit": 20,
  "pages": 5
}
```

#### Get Extension Details
```
GET /api/extensions/:id
```

Response:
```json
{
  "id": "extension-id",
  "name": "Extension Name",
  "description": "Description",
  "author": "username",
  "versions": [...],
  "changelog": [...],
  "stats": {
    "total_downloads": 1000,
    "downloads_last_30d": 100,
    "avg_rating": 4.5,
    "total_ratings": 50
  }
}
```

#### Download Extension Version
```
GET /api/extensions/:id/versions/:version
```

Returns the extension package file (.tar.gz)

#### Get Reviews
```
GET /api/extensions/:id/reviews?page=1&limit=10
```

Response:
```json
{
  "reviews": [...],
  "total": 25,
  "page": 1,
  "limit": 10,
  "pages": 3
}
```

### Authenticated Endpoints

#### Register User
```
POST /api/auth/register
Content-Type: application/json

{
  "username": "user123",
  "password": "secure-password",
  "email": "user@example.com"
}
```

#### Login
```
POST /api/auth/login
Content-Type: application/json

{
  "username": "user123",
  "password": "secure-password"
}
```

Response:
```json
{
  "success": true,
  "user": {...},
  "token": "jwt-token-here"
}
```

#### Publish Extension
```
POST /api/extensions
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <extension.tar.gz>
manifest: <manifest.json>
```

The extension undergoes:
1. Manifest validation against schema
2. Security scanning for malicious patterns
3. Code signing verification
4. Placement in approval queue

#### Submit Rating
```
POST /api/extensions/:id/rate
Authorization: Bearer <token>
Content-Type: application/json

{
  "rating": 5,
  "review": "Great extension!",
  "version": "1.0.0"
}
```

### Admin Endpoints

All admin endpoints require authentication with an admin account.

#### Get Approval Queue
```
GET /api/admin/queue
Authorization: Bearer <admin-token>
```

#### Approve Extension
```
POST /api/admin/extensions/:id/approve
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "version": "1.0.0"
}
```

#### Reject Extension
```
POST /api/admin/extensions/:id/reject
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "version": "1.0.0",
  "reason": "Security concerns"
}
```

## Security Features

### Automated Security Scanning

The security scanner performs multiple checks on published extensions:

1. **Signature Verification**: Validates code signing using existing infrastructure
2. **Malicious Pattern Detection**: Scans for dangerous code patterns
   - `eval()`, `Function()` constructors
   - Process spawning
   - File system manipulation
   - Obfuscation techniques
3. **Permission Analysis**: Flags suspicious permission requests
4. **Entropy Analysis**: Detects potentially obfuscated code
5. **Intrusion Detection**: Integrates with IDS for behavioral analysis

### Manifest Validation

All manifests are validated against the Ghost manifest schema:
- Required fields (`id`, `name`, `version`, `main`, `capabilities`)
- Semantic versioning
- Valid capability declarations
- Permission enumeration
- Network allowlist format
- Git hooks validation

### Rate Limiting

Implements token bucket rate limiting:
- Default: 100 requests per minute per IP
- Configurable window and limits
- Automatic cleanup of expired entries

### Authentication

JWT-based authentication with:
- PBKDF2 password hashing (100,000 iterations)
- HMAC-SHA256 token signing
- 24-hour token expiry (configurable)
- Secure secret generation and storage

## Database Schema

### Users Table
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
```

### Extensions Table
```sql
CREATE TABLE extensions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    author TEXT NOT NULL,
    author_id INTEGER NOT NULL,
    category TEXT,
    tags TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (author_id) REFERENCES users(id)
);
```

### Extension Versions Table
```sql
CREATE TABLE extension_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    extension_id TEXT NOT NULL,
    version TEXT NOT NULL,
    manifest TEXT NOT NULL,
    file_path TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    rejection_reason TEXT,
    changelog TEXT,
    created_at INTEGER NOT NULL,
    approved_at INTEGER,
    FOREIGN KEY (extension_id) REFERENCES extensions(id),
    UNIQUE(extension_id, version)
);
```

### Ratings Table
```sql
CREATE TABLE ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    extension_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    review TEXT,
    version TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (extension_id) REFERENCES extensions(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(extension_id, user_id)
);
```

### Downloads Table
```sql
CREATE TABLE downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    extension_id TEXT NOT NULL,
    version TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    downloaded_at INTEGER NOT NULL,
    FOREIGN KEY (extension_id) REFERENCES extensions(id)
);
```

## Running the Server

### Using Node.js directly
```bash
node core/marketplace-backend/cli.js --port 3000
```

### With custom database path
```bash
node core/marketplace-backend/cli.js --port 8080 --db /path/to/registry.db
```

### Programmatically
```javascript
const { MarketplaceServer } = require('./core/marketplace-backend');

const server = new MarketplaceServer({
    port: 3000,
    dbPath: './registry.db'
});

server.start();
```

## Configuration

The server accepts the following options:

```javascript
{
    port: 3000,                    // HTTP port
    dbPath: './registry.db',       // SQLite database path
    uploadDir: './uploads',        // Extension file storage
    jwtSecret: 'auto-generated',   // JWT signing secret
    tokenExpiry: 86400000,         // Token expiry (24h)
    windowMs: 60000,               // Rate limit window (1min)
    maxRequests: 100               // Max requests per window
}
```

## Admin User Setup

To create an admin user, use the AuthManager programmatically:

```javascript
const { AuthManager } = require('./core/marketplace-backend');

const authManager = new AuthManager();
const result = authManager.register('admin', 'secure-password', 'admin@example.com');
authManager.promoteToAdmin(result.user.id);
```

## Trending Algorithm

The download tracker calculates trending extensions based on:
- Download velocity over the last 7 days
- Total download count
- Rating average and count
- Recency of latest version

## Dependencies

Core Node.js modules only (zero-install design):
- `http` - HTTP server
- `url`, `querystring` - URL parsing
- `fs`, `path` - File system operations
- `crypto` - Cryptographic functions
- `zlib` - Compression
- `sqlite3` - Database (needs to be installed)
- `tar-stream` - TAR archive handling (needs to be installed)

External dependencies required:
```bash
npm install sqlite3 tar-stream
```

## Security Best Practices

1. **Never expose the marketplace server directly to the internet** - Use a reverse proxy (nginx, Apache)
2. **Enable HTTPS** - Use TLS/SSL certificates
3. **Set strong JWT secret** - Don't rely on auto-generated secrets in production
4. **Regular database backups** - SQLite database should be backed up regularly
5. **Monitor approval queue** - Review pending extensions promptly
6. **Review security scan results** - Don't auto-approve extensions with warnings

## File Structure

```
core/marketplace-backend/
├── server.js              # Main HTTP server and routing
├── database.js            # SQLite database layer
├── security-scanner.js    # Automated security scanning
├── manifest-validator.js  # Manifest schema validation
├── rate-limiter.js        # Token bucket rate limiting
├── auth-manager.js        # JWT authentication and user management
├── admin-dashboard.js     # Admin moderation interface
├── download-tracker.js    # Download analytics and trending
├── index.js               # Module exports
├── cli.js                 # Command-line interface
├── registry.db            # SQLite database (created on first run)
├── uploads/               # Extension file storage (created on first run)
└── README.md              # This file
```

## License

MIT License - Same as Ghost CLI

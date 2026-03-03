# Marketplace API Reference

Complete REST API documentation for the Ghost Extension Marketplace.

## Base URL

```
http://localhost:3000
```

## Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

Tokens are obtained through `/api/auth/login` or `/api/auth/register`.

## Rate Limiting

All endpoints are rate-limited:
- **Limit**: 100 requests per minute per IP
- **Headers**: `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- **Status**: `429 Too Many Requests` when exceeded

## Endpoints

### Authentication

#### Register User

Create a new user account.

**Request**
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "string",
  "password": "string",
  "email": "string"
}
```

**Response** `201 Created`
```json
{
  "success": true,
  "user": {
    "id": 1,
    "username": "string",
    "email": "string",
    "isAdmin": false,
    "createdAt": 1234567890
  },
  "token": "eyJhbGc..."
}
```

**Errors**
- `400`: Missing fields or validation error
- `409`: Username or email already exists

---

#### Login

Authenticate and receive a JWT token.

**Request**
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "string",
  "password": "string"
}
```

**Response** `200 OK`
```json
{
  "success": true,
  "user": {
    "id": 1,
    "username": "string",
    "email": "string",
    "isAdmin": false
  },
  "token": "eyJhbGc..."
}
```

**Errors**
- `401`: Invalid credentials

---

### Extensions

#### Search Extensions

Search and filter extensions with pagination.

**Request**
```http
GET /api/extensions?q=search&category=tools&tags=git,automation&author=username&sort=downloads&page=1&limit=20
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query (searches name and description) |
| `category` | string | Filter by category |
| `tags` | string | Comma-separated tags |
| `author` | string | Filter by author username |
| `sort` | string | Sort order: `recent`, `downloads`, `rating` |
| `page` | integer | Page number (default: 1) |
| `limit` | integer | Items per page (default: 20, max: 100) |

**Response** `200 OK`
```json
{
  "extensions": [
    {
      "id": "extension-id",
      "name": "Extension Name",
      "description": "Description text",
      "author": "username",
      "category": "tools",
      "tags": ["git", "automation"],
      "downloadCount": 1000,
      "avgRating": 4.5,
      "ratingCount": 50,
      "createdAt": 1234567890,
      "updatedAt": 1234567890
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 20,
  "pages": 5
}
```

---

#### Get Extension Details

Get detailed information about a specific extension.

**Request**
```http
GET /api/extensions/:id
```

**Response** `200 OK`
```json
{
  "id": "extension-id",
  "name": "Extension Name",
  "description": "Description",
  "author": "username",
  "category": "tools",
  "tags": ["git"],
  "downloadCount": 1000,
  "avgRating": 4.5,
  "ratingCount": 50,
  "versions": [
    {
      "version": "1.0.0",
      "manifest": {...},
      "status": "approved",
      "changelog": "Initial release",
      "createdAt": 1234567890,
      "approvedAt": 1234567900
    }
  ],
  "changelog": [
    {
      "version": "1.0.0",
      "changelog": "Initial release",
      "created_at": 1234567890
    }
  ],
  "stats": {
    "total_downloads": 1000,
    "downloads_last_30d": 100,
    "avg_rating": 4.5,
    "total_ratings": 50
  }
}
```

**Errors**
- `404`: Extension not found

---

#### Publish Extension

Publish a new extension or version. Requires authentication.

**Request**
```http
POST /api/extensions
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <extension.tar.gz>
manifest: <manifest.json>
```

**Process Flow**
1. Manifest validation against schema
2. Security scanning for malicious code
3. Code signing verification
4. File storage
5. Placement in approval queue

**Response** `201 Created`
```json
{
  "success": true,
  "extension": {
    "id": "extension-id",
    "version": "1.0.0",
    "status": "pending"
  }
}
```

**Errors**
- `400`: Invalid manifest or failed security scan
- `401`: Authentication required

---

#### Download Extension

Download a specific version of an extension.

**Request**
```http
GET /api/extensions/:id/versions/:version
```

**Response** `200 OK`
- Content-Type: `application/gzip`
- Content-Disposition: `attachment; filename="extension-id-1.0.0.tar.gz"`

**Errors**
- `403`: Extension not approved
- `404`: Extension or version not found

---

#### Submit Rating

Rate an extension. Requires authentication. One rating per user per extension.

**Request**
```http
POST /api/extensions/:id/rate
Authorization: Bearer <token>
Content-Type: application/json

{
  "rating": 5,
  "review": "Great extension!",
  "version": "1.0.0"
}
```

**Response** `201 Created`
```json
{
  "success": true,
  "rating": {
    "id": 1,
    "extensionId": "extension-id",
    "userId": 1,
    "rating": 5,
    "review": "Great extension!",
    "version": "1.0.0"
  }
}
```

**Errors**
- `400`: Invalid rating (must be 1-5)
- `401`: Authentication required

---

#### Get Reviews

Get paginated reviews for an extension.

**Request**
```http
GET /api/extensions/:id/reviews?page=1&limit=10
```

**Response** `200 OK`
```json
{
  "reviews": [
    {
      "id": 1,
      "extension_id": "extension-id",
      "user_id": 1,
      "username": "reviewer",
      "rating": 5,
      "review": "Great extension!",
      "version": "1.0.0",
      "created_at": 1234567890
    }
  ],
  "total": 25,
  "page": 1,
  "limit": 10,
  "pages": 3
}
```

---

### Admin Endpoints

All admin endpoints require authentication with an admin account.

#### Get Approval Queue

Get all pending extensions awaiting moderation.

**Request**
```http
GET /api/admin/queue
Authorization: Bearer <admin-token>
```

**Response** `200 OK`
```json
{
  "total": 5,
  "extensions": [
    {
      "id": 1,
      "extensionId": "extension-id",
      "version": "1.0.0",
      "manifest": {...},
      "status": "pending",
      "createdAt": 1234567890,
      "stats": {...}
    }
  ]
}
```

**Errors**
- `403`: Admin access required

---

#### Approve Extension

Approve a pending extension version.

**Request**
```http
POST /api/admin/extensions/:id/approve
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "version": "1.0.0"
}
```

**Response** `200 OK`
```json
{
  "success": true
}
```

**Errors**
- `403`: Admin access required
- `404`: Extension or version not found

---

#### Reject Extension

Reject a pending extension version with reason.

**Request**
```http
POST /api/admin/extensions/:id/reject
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "version": "1.0.0",
  "reason": "Security concerns: uses eval()"
}
```

**Response** `200 OK`
```json
{
  "success": true
}
```

**Errors**
- `403`: Admin access required
- `404`: Extension or version not found

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message"
}
```

### Common Status Codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Created |
| `400` | Bad Request (validation error) |
| `401` | Unauthorized (invalid/missing token) |
| `403` | Forbidden (insufficient permissions) |
| `404` | Not Found |
| `429` | Too Many Requests (rate limit exceeded) |
| `500` | Internal Server Error |

---

## Examples

### Using cURL

**Search extensions:**
```bash
curl "http://localhost:3000/api/extensions?q=git&sort=downloads"
```

**Register user:**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"user123","password":"pass123","email":"user@example.com"}'
```

**Login:**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user123","password":"pass123"}'
```

**Publish extension:**
```bash
curl -X POST http://localhost:3000/api/extensions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@extension.tar.gz" \
  -F "manifest=@manifest.json"
```

**Download extension:**
```bash
curl -o extension.tar.gz \
  "http://localhost:3000/api/extensions/my-extension/versions/1.0.0"
```

### Using JavaScript (Node.js)

See `client-example.js` for a complete client implementation.

```javascript
const { MarketplaceClient } = require('./client-example');

const client = new MarketplaceClient('http://localhost:3000');

// Login
await client.login('username', 'password');

// Search
const results = await client.searchExtensions({ q: 'git', sort: 'downloads' });

// Get details
const extension = await client.getExtension('my-extension');

// Rate
await client.rateExtension('my-extension', 5, 'Excellent!');

// Download
await client.downloadExtension('my-extension', '1.0.0', './extension.tar.gz');
```

---

## Webhooks (Future)

Webhook support for events:
- Extension published
- Extension approved/rejected
- New rating submitted
- Download milestones

---

## Changelog

### v1.0.0
- Initial release
- User authentication
- Extension publishing
- Search and filtering
- Ratings and reviews
- Admin moderation
- Download tracking

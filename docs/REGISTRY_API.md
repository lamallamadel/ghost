# Ghost Extension Registry API

Complete API reference for the Ghost Extension Registry.

## Base URL

```
https://registry.ghost-cli.dev/api
```

Local development:
```
http://localhost:3000/api
```

## Authentication

Currently, the API does not require authentication for read operations. Write operations (publishing extensions, submitting reviews) are open but will require authentication in future versions.

## Rate Limiting

- **General API**: 100 requests per 15 minutes per IP
- **Search**: Unlimited (cached)
- **Publish**: 10 requests per hour per IP

## Endpoints

### Extensions

#### Search Extensions

Search and filter extensions with pagination.

```http
GET /api/extensions
```

**Query Parameters:**

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| q | string | Search query (name, description, id) | - |
| category | string | Filter by category | - |
| verified | boolean | Filter verified extensions | - |
| sort | string | Sort order (downloads, recent, name, rating) | downloads |
| limit | integer | Results per page (1-100) | 50 |
| offset | integer | Pagination offset | 0 |

**Response:**

```json
{
  "extensions": [
    {
      "id": "ai-commit-helper",
      "name": "AI Commit Helper",
      "description": "Generates intelligent commit messages",
      "author": "Ghost Team",
      "category": "git",
      "homepage": "https://github.com/ghost/ai-commit-helper",
      "repository": "https://github.com/ghost/ai-commit-helper.git",
      "license": "MIT",
      "verified": true,
      "featured": false,
      "tags": ["ai", "git", "commit"],
      "ratings": {
        "average": 4.8,
        "count": 245,
        "distribution": {
          "5": 200,
          "4": 35,
          "3": 8,
          "2": 1,
          "1": 1
        }
      },
      "downloads": 5420,
      "latest_version": "2.1.0",
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-10T12:00:00.000Z",
      "versions": [
        {
          "version": "2.1.0",
          "published_at": "2024-01-10T12:00:00.000Z",
          "downloads": 1200,
          "security_scan_status": "passed"
        }
      ]
    }
  ],
  "total": 150,
  "limit": 50,
  "offset": 0
}
```

#### Get Extension Details

Get detailed information about a specific extension.

```http
GET /api/extensions/:id
```

**Response:** Same structure as search result item, but single object.

#### Get Extension Versions

List all versions of an extension.

```http
GET /api/extensions/:id/versions
```

**Response:**

```json
{
  "versions": [
    {
      "version": "2.1.0",
      "published_at": "2024-01-10T12:00:00.000Z",
      "deprecated": false,
      "downloads": 1200,
      "tarball_url": "/packages/ai-commit-helper-2.1.0.tar.gz",
      "tarball_hash": "sha256:abc123...",
      "signature": "base64-signature",
      "security_scan_status": "passed",
      "manifest": {
        "id": "ai-commit-helper",
        "name": "AI Commit Helper",
        "version": "2.1.0",
        "main": "index.js",
        "capabilities": { }
      }
    }
  ]
}
```

#### Publish Extension

Publish a new extension or new version of existing extension.

```http
POST /api/extensions/publish
Content-Type: multipart/form-data
```

**Form Fields:**

- `tarball` (file, required): Extension package (.tar.gz)
- `data` (JSON string, required): Extension metadata

**Data Structure:**

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "description": "Extension description (max 500 chars)",
  "author": "Author Name",
  "author_email": "author@example.com",
  "category": "utilities",
  "homepage": "https://github.com/user/extension",
  "repository": "https://github.com/user/extension.git",
  "license": "MIT",
  "tags": ["tag1", "tag2"],
  "manifest": {
    "id": "my-extension",
    "name": "My Extension",
    "version": "1.0.0",
    "main": "index.js",
    "capabilities": { }
  },
  "readme": "# My Extension\n\nDescription...",
  "changelog": "## 1.0.0\n- Initial release"
}
```

**Response:**

```json
{
  "extensionId": "my-extension",
  "version": "1.0.0",
  "created": true
}
```

**Status Codes:**
- 201: Created (new extension)
- 200: OK (new version of existing extension)
- 400: Bad Request (validation error)
- 409: Conflict (version already exists)

### Downloads

#### Record Download

Track a download event.

```http
POST /api/extensions/:id/download/:version
```

**Response:**

```json
{
  "success": true
}
```

#### Get Download Statistics

Get download statistics for an extension.

```http
GET /api/extensions/:id/stats
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| start | timestamp | Start date (Unix milliseconds) |
| end | timestamp | End date (Unix milliseconds) |
| groupBy | string | Grouping (day, week, month) |

**Response:**

```json
{
  "extension_id": "my-extension",
  "total_downloads": 5420,
  "stats": [
    {
      "date": "2024-01-15",
      "downloads": 120
    },
    {
      "date": "2024-01-14",
      "downloads": 95
    }
  ]
}
```

### Ratings

#### Submit Rating

Submit or update a rating for an extension.

```http
POST /api/extensions/:id/ratings
Content-Type: application/json
```

**Request Body:**

```json
{
  "user_id": "user-123",
  "rating": 5
}
```

**Response:**

```json
{
  "success": true,
  "average": 4.8,
  "count": 246
}
```

### Reviews

#### Submit Review

Submit a review for an extension.

```http
POST /api/extensions/:id/reviews
Content-Type: application/json
```

**Request Body:**

```json
{
  "user_id": "user-123",
  "rating": 5,
  "title": "Great extension!",
  "comment": "This extension has saved me so much time...",
  "version": "1.0.0"
}
```

**Response:**

```json
{
  "success": true,
  "review_id": 123
}
```

#### Get Reviews

Get reviews for an extension.

```http
GET /api/extensions/:id/reviews
```

**Query Parameters:**

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| limit | integer | Results per page (1-100) | 20 |
| offset | integer | Pagination offset | 0 |
| sort | string | Sort order (recent, helpful, rating_high, rating_low) | recent |

**Response:**

```json
{
  "reviews": [
    {
      "id": 123,
      "version": "1.0.0",
      "user_id": "user-123",
      "rating": 5,
      "title": "Great extension!",
      "comment": "This extension has saved me so much time...",
      "helpful_count": 15,
      "verified_purchase": true,
      "created_at": "2024-01-15T10:30:00.000Z",
      "updated_at": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

### Security

#### Get Security Scans

Get security scan results for a specific version.

```http
GET /api/extensions/:id/security/:version
```

**Response:**

```json
{
  "scans": [
    {
      "id": 1,
      "scan_type": "automated",
      "status": "completed",
      "severity": "low",
      "findings": {
        "issues": [
          {
            "type": "missing_description",
            "severity": "low",
            "message": "Description field is missing"
          }
        ],
        "summary": {
          "critical": 0,
          "high": 0,
          "medium": 0,
          "low": 1,
          "info": 0
        }
      },
      "started_at": "2024-01-15T10:00:00.000Z",
      "completed_at": "2024-01-15T10:00:30.000Z"
    }
  ]
}
```

### Categories

#### List Categories

Get all available extension categories.

```http
GET /api/categories
```

**Response:**

```json
{
  "categories": [
    {
      "id": "git",
      "name": "Git Tools",
      "description": "Extensions for Git operations and workflows"
    },
    {
      "id": "development",
      "name": "Development",
      "description": "Code editing, formatting, and development tools"
    },
    {
      "id": "security",
      "name": "Security",
      "description": "Security scanning and vulnerability detection"
    }
  ]
}
```

## Error Responses

All errors follow this structure:

```json
{
  "error": "Error message",
  "requestId": "abc123def456"
}
```

**Common Status Codes:**
- 400: Bad Request
- 404: Not Found
- 409: Conflict
- 429: Too Many Requests
- 500: Internal Server Error

## Examples

### Search for Git Extensions

```bash
curl "https://registry.ghost-cli.dev/api/extensions?category=git&sort=downloads&limit=10"
```

### Publish an Extension

```bash
curl -X POST https://registry.ghost-cli.dev/api/extensions/publish \
  -F "tarball=@my-extension-1.0.0.tar.gz" \
  -F 'data={"id":"my-extension","name":"My Extension","version":"1.0.0","author":"Me","manifest":{...}}'
```

### Submit a Review

```bash
curl -X POST https://registry.ghost-cli.dev/api/extensions/my-extension/reviews \
  -H "Content-Type: application/json" \
  -d '{"user_id":"user-123","rating":5,"comment":"Great!"}'
```

## Client Libraries

### Node.js

```javascript
const axios = require('axios');

const client = axios.create({
  baseURL: 'https://registry.ghost-cli.dev/api'
});

// Search extensions
const { data } = await client.get('/extensions', {
  params: { category: 'git', sort: 'downloads' }
});

// Get extension details
const extension = await client.get('/extensions/ai-commit-helper');

// Submit rating
await client.post('/extensions/ai-commit-helper/ratings', {
  user_id: 'user-123',
  rating: 5
});
```

## Webhooks

Webhook support is planned for future releases. Subscribe to events:
- Extension published
- New review submitted
- Security scan completed
- Download milestones

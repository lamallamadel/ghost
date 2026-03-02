# Ghost Extension Registry

Public extension registry with REST API, download statistics, user ratings/reviews, and automated security scanning.

## Features

- **Extension Search & Discovery**: Full-text search with category filtering and sorting
- **Version Management**: Semantic versioning support with version history
- **Download Statistics**: Track downloads with IP hashing and geographic data
- **User Ratings & Reviews**: 5-star rating system with detailed reviews
- **Manifest Validation**: Automatic validation of extension manifests
- **Security Scanning**: Automated security scanning pipeline for all submitted extensions

## Quick Start

### Installation

```bash
cd registry
npm install
```

### Start the Server

```bash
npm start
```

The API will be available at `http://localhost:3000`

### Development Mode

```bash
npm run dev
```

## API Endpoints

### Extensions

#### Search Extensions
```
GET /api/extensions?q=search&category=git&sort=downloads&limit=50&offset=0
```

Query Parameters:
- `q` - Search query (searches name, description, id)
- `category` - Filter by category (git, development, security, testing, utilities, api, data)
- `verified` - Filter verified extensions (true/false)
- `sort` - Sort order (downloads, recent, name, rating)
- `limit` - Results per page (1-100, default: 50)
- `offset` - Pagination offset (default: 0)

#### Get Extension Details
```
GET /api/extensions/:id
```

Returns full extension details including versions, ratings, and tags.

#### Get Extension Versions
```
GET /api/extensions/:id/versions
```

Returns all versions for an extension.

#### Publish Extension
```
POST /api/extensions/publish
Content-Type: multipart/form-data

Fields:
- tarball: File (required) - .tar.gz file
- data: JSON (required) - Extension metadata
```

Data JSON structure:
```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "description": "Extension description",
  "author": "Author Name",
  "author_email": "author@example.com",
  "category": "utilities",
  "homepage": "https://github.com/user/extension",
  "repository": "https://github.com/user/extension.git",
  "license": "MIT",
  "tags": ["tag1", "tag2"],
  "manifest": { /* manifest.json content */ },
  "readme": "README content",
  "changelog": "CHANGELOG content"
}
```

### Download Statistics

#### Record Download
```
POST /api/extensions/:id/download/:version
```

#### Get Download Statistics
```
GET /api/extensions/:id/stats?start=timestamp&end=timestamp
```

### Ratings & Reviews

#### Submit Rating
```
POST /api/extensions/:id/ratings
Content-Type: application/json

{
  "user_id": "user-123",
  "rating": 5
}
```

#### Submit Review
```
POST /api/extensions/:id/reviews
Content-Type: application/json

{
  "user_id": "user-123",
  "rating": 5,
  "title": "Great extension!",
  "comment": "This extension is amazing...",
  "version": "1.0.0"
}
```

#### Get Reviews
```
GET /api/extensions/:id/reviews?limit=20&offset=0&sort=recent
```

Sort options: `recent`, `helpful`, `rating_high`, `rating_low`

### Security

#### Get Security Scans
```
GET /api/extensions/:id/security/:version
```

Returns all security scan results for a specific version.

### Categories

#### List Categories
```
GET /api/categories
```

Returns all available extension categories.

## Security Scanner

The registry includes an automated security scanning pipeline that checks:

- **Manifest Validation**: Validates manifest structure and fields
- **Code Analysis**: Scans for dangerous patterns (eval, hardcoded secrets, etc.)
- **Dependency Scanning**: Checks for known vulnerabilities in dependencies
- **Permission Analysis**: Reviews requested permissions for security concerns

### Running Security Scans

#### Command Line
```bash
node security-scanner/cli.js /path/to/extension

# Options
node security-scanner/cli.js /path/to/extension --format text --output report.txt
node security-scanner/cli.js --tarball extension.tar.gz --severity high
```

#### Programmatic Usage
```javascript
const { SecurityScanner } = require('./security-scanner/scanner');

const scanner = new SecurityScanner({ severityThreshold: 'medium' });
const results = await scanner.scanExtension('/path/to/extension');

console.log(results);
```

## Database Schema

The registry uses SQLite with the following tables:

- `extensions` - Extension metadata
- `extension_versions` - Version information
- `extension_tags` - Extension tags
- `extension_dependencies` - Version dependencies
- `extension_compatibility` - Compatibility information
- `ratings` - User ratings
- `reviews` - User reviews with comments
- `review_responses` - Author responses to reviews
- `download_stats` - Download tracking
- `security_scans` - Security scan results

## Configuration

Environment variables:

- `PORT` - Server port (default: 3000)
- `DB_PATH` - Database file path (default: ./data/registry.db)
- `NODE_ENV` - Environment (development/production)

## Development

### Database Migrations

```bash
npm run db:migrate
```

### Seed Database

```bash
npm run db:seed
```

## Architecture

```
registry/
├── server.js              # Express server
├── api/
│   ├── registry.js        # Registry business logic
│   └── routes.js          # API route handlers
├── db/
│   └── database.js        # Database layer
├── security-scanner/
│   ├── scanner.js         # Main scanner
│   ├── cli.js             # CLI interface
│   └── scanners/
│       ├── manifest-scanner.js
│       ├── code-scanner.js
│       ├── dependency-scanner.js
│       └── permission-scanner.js
├── data/                  # SQLite database
├── packages/              # Published extension tarballs
└── uploads/               # Temporary upload directory
```

## Security

- Rate limiting on all API endpoints
- IP hashing for download tracking
- Manifest validation before publishing
- Automated security scanning
- Helmet.js security headers
- CORS enabled

## License

MIT

# Extension Manifest Quick Reference

## Minimal Valid Manifest

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "main": "index.js",
  "capabilities": {}
}
```

## Complete Example

```json
{
  "id": "advanced-extension",
  "name": "Advanced Extension",
  "version": "2.1.0",
  "description": "Full-featured extension example",
  "author": "Ghost Team",
  "main": "dist/index.js",
  "capabilities": {
    "filesystem": {
      "read": ["src/**/*.js", "**/*.json"],
      "write": [".ghost/cache/*.json"]
    },
    "network": {
      "allowlist": ["https://api.example.com"],
      "rateLimit": {
        "cir": 60,
        "bc": 10
      }
    },
    "git": {
      "read": true,
      "write": false
    },
    "hooks": ["pre-commit", "commit-msg"]
  },
  "permissions": [
    "filesystem:read",
    "filesystem:write",
    "network:https",
    "git:read"
  ],
  "dependencies": {
    "axios": "^1.6.0"
  },
  "config": {
    "enabled": true,
    "timeout": 5000
  }
}
```

## Field Specifications

### id
- **Type**: `string`
- **Required**: Yes
- **Pattern**: `^[a-z0-9-]+$`
- **Example**: `"code-analyzer"`, `"git-hooks-manager"`

### name
- **Type**: `string`
- **Required**: Yes
- **Min Length**: 1
- **Example**: `"Code Quality Analyzer"`

### version
- **Type**: `string`
- **Required**: Yes
- **Pattern**: `^\d+\.\d+\.\d+$`
- **Example**: `"1.0.0"`, `"2.3.1"`

### main
- **Type**: `string`
- **Required**: Yes
- **Description**: Relative path from extension root
- **Example**: `"index.js"`, `"dist/main.js"`

### description
- **Type**: `string`
- **Required**: No
- **Example**: `"Analyzes code quality and enforces standards"`

### author
- **Type**: `string`
- **Required**: No
- **Example**: `"John Doe"`, `"ACME Corp"`

### capabilities
- **Type**: `object`
- **Required**: Yes
- **Properties**: `filesystem`, `network`, `git`, `hooks`

#### capabilities.filesystem
```json
{
  "filesystem": {
    "read": ["src/**/*.js", "**/*.json"],
    "write": ["logs/*.log"]
  }
}
```
- **read**: Array of glob patterns for read access
- **write**: Array of glob patterns for write access

#### capabilities.network
```json
{
  "network": {
    "allowlist": ["https://api.github.com"],
    "rateLimit": {
      "cir": 60,
      "bc": 10
    }
  }
}
```
- **allowlist**: Array of allowed URLs (protocol + domain only)
- **rateLimit.cir**: Sustained requests per minute (integer ≥ 1)
- **rateLimit.bc**: Burst size in requests (integer ≥ 1)

#### capabilities.git
```json
{
  "git": {
    "read": true,
    "write": false
  }
}
```
- **read**: Boolean for read-only access
- **write**: Boolean for modification access

#### capabilities.hooks
```json
{
  "hooks": ["pre-commit", "post-commit"]
}
```
- **Type**: Array of strings
- **Valid Values**: 
  - `pre-commit`
  - `post-commit`
  - `pre-push`
  - `post-checkout`
  - `commit-msg`
  - `pre-rebase`

### permissions
```json
{
  "permissions": [
    "filesystem:read",
    "network:https",
    "git:read"
  ]
}
```
- **Type**: Array of strings
- **Valid Values**:
  - `filesystem:read`
  - `filesystem:write`
  - `network:http`
  - `network:https`
  - `git:read`
  - `git:write`
  - `process:spawn`
  - `env:read`

### dependencies
```json
{
  "dependencies": {
    "axios": "^1.6.0",
    "chalk": "^4.1.2"
  }
}
```
- **Type**: Object mapping package names to version ranges
- **Format**: Standard NPM dependency format

### config
```json
{
  "config": {
    "enabled": true,
    "severity": "warning",
    "rules": {
      "maxComplexity": 10
    }
  }
}
```
- **Type**: Object with arbitrary structure
- **Purpose**: Default configuration values
- **Usage**: Passed to extension's `init()` method

## Validation Rules

### ID Validation
- Must be lowercase
- Only alphanumeric characters and hyphens
- No spaces or special characters
- Example valid: `my-extension`, `code-analyzer-v2`
- Example invalid: `My Extension`, `code_analyzer`, `ext@1`

### Version Validation
- Must follow semantic versioning
- Format: `MAJOR.MINOR.PATCH`
- All parts must be integers
- Example valid: `1.0.0`, `2.15.3`
- Example invalid: `1.0`, `v1.0.0`, `1.0.0-beta`

### Network Allowlist Validation
- Must include protocol (`http://` or `https://`)
- Must include domain
- Must NOT include path, query, or fragment
- Example valid: `https://api.github.com`, `http://localhost:3000`
- Example invalid: `github.com`, `https://api.github.com/users`

### Rate Limit Validation
- Both `cir` and `bc` required if `rateLimit` specified
- Must be positive integers (≥ 1)
- `cir`: Sustained rate (requests per minute)
- `bc`: Burst size (max concurrent requests)

### Hook Name Validation
- Must be one of the supported hooks
- Case-sensitive
- No custom hooks allowed

## Common Patterns

### Read-Only File Access
```json
{
  "capabilities": {
    "filesystem": {
      "read": ["**/*.js", "**/*.ts"]
    }
  },
  "permissions": ["filesystem:read"]
}
```

### Write Configuration Files
```json
{
  "capabilities": {
    "filesystem": {
      "read": ["config/*.json"],
      "write": ["config/*.json"]
    }
  },
  "permissions": ["filesystem:read", "filesystem:write"]
}
```

### API Integration
```json
{
  "capabilities": {
    "network": {
      "allowlist": ["https://api.service.com"],
      "rateLimit": {
        "cir": 30,
        "bc": 5
      }
    }
  },
  "permissions": ["network:https"]
}
```

### Git Read-Only
```json
{
  "capabilities": {
    "git": {
      "read": true,
      "write": false
    }
  },
  "permissions": ["git:read"]
}
```

### Pre-Commit Hook
```json
{
  "capabilities": {
    "filesystem": {
      "read": ["src/**/*.js"]
    },
    "git": {
      "read": true
    },
    "hooks": ["pre-commit"]
  },
  "permissions": ["filesystem:read", "git:read"]
}
```

## Rate Limit Examples

### Conservative (30 req/min, small bursts)
```json
{
  "rateLimit": {
    "cir": 30,
    "bc": 5
  }
}
```

### Standard (60 req/min, medium bursts)
```json
{
  "rateLimit": {
    "cir": 60,
    "bc": 10
  }
}
```

### Aggressive (120 req/min, large bursts)
```json
{
  "rateLimit": {
    "cir": 120,
    "bc": 20
  }
}
```

## Error Messages

### Common Validation Errors

**Invalid ID:**
```
Field "id" must be lowercase alphanumeric with hyphens
```

**Invalid Version:**
```
Field "version" must follow semver format (e.g., 1.0.0)
```

**Invalid URL:**
```
Invalid allowlist URL: https://api.example.com/path (must be protocol + domain only)
```

**Invalid Rate Limit:**
```
capabilities.network.rateLimit.cir must be a positive integer
```

**Invalid Hook:**
```
Invalid hook: pre-merge
```

**Missing Field:**
```
Missing or invalid "main" field
```

## Tips

1. **Start Simple**: Begin with minimal capabilities and add as needed
2. **Be Specific**: Use precise glob patterns instead of wildcards
3. **Rate Limits**: Set conservative limits initially, increase if needed
4. **Documentation**: Add description and author for clarity
5. **Testing**: Validate manifest before deploying
6. **Versioning**: Bump version on every change
7. **Permissions**: Match permissions to capabilities

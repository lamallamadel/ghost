# NIST SI-10 Quick Reference Card

## Key Constants

```javascript
EntropyScanner.ENTROPY_THRESHOLD = 4.5
EntropyScanner.MIN_LENGTH_FOR_SCAN = 16
```

## Validation Rules

### Path Traversal (SI-10-PATH-TRAVERSAL)
- `../` `..\\` `..\./` 
- `%2e%2e` `%252e%252e`
- `\x00` `\x2f`

### Command Injection (SI-10-COMMAND-INJECTION)
- `&&` `||` `;` `|` 
- `` ` `` `$()` 
- `> /` `< /`
- `\n` `\r` `\x00`
- `--eval` `-e` `eval()` `exec()` `system()`

### SSRF Protection (SI-10-SSRF-*)
- **Localhost:** `127.0.0.1` `::1` `0.0.0.0`
- **Private IPs:** `10.*` `172.16-31.*` `192.168.*` `169.254.*`
- **Metadata:** `169.254.169.254` `metadata.google.internal`
- **IPv6:** `fc00::` `fd00::` `fe80::`

### Secret Detection (SI-10-SECRET-DETECTION)
- AWS Keys: `AKIA[0-9A-Z]{16}`
- Private Keys: `-----BEGIN`
- API Keys, Tokens, Passwords, Secrets
- High Entropy: >4.5 && ≥16 chars

## Audit Logger

```javascript
// Immutable log entry
const entry = Object.freeze({
    timestamp: new Date().toISOString(),  // ISO 8601
    ...data
});

// Format: Newline-delimited JSON
```

## Execution Blocking

```javascript
if (!validationResult.valid) {
    return {
        passed: false,
        code: 'AUDIT_VALIDATION_FAILED',
        violations: [...]
    };
}
```

## .ghostignore Patterns

```
# Single file
secrets.conf

# Directory
config/

# Wildcard
.env*
*.bak

# Auto-excluded
node_modules/
.git/
```

## Test Commands

```bash
# Unit tests
node test/audit-nist-compliance.test.js

# Integration tests
node test/audit-ghostignore.integration.test.js

# Existing tests
node test/audit.test.js
```

## Compliance Checklist

- ✅ Path traversal: 8 patterns
- ✅ Command injection: 11 patterns  
- ✅ SSRF: 4 categories
- ✅ Secrets: 6 patterns + entropy
- ✅ Entropy: 4.5 threshold
- ✅ Min length: 16 chars
- ✅ Immutable logs: Object.freeze()
- ✅ Timestamps: ISO 8601
- ✅ Blocking: All violations
- ✅ .ghostignore: 12 tests

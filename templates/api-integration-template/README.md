# API Integration Template

A comprehensive template for building REST and GraphQL API integrations with Ghost CLI extensions.

## Features

- **Multiple Authentication Types**: Bearer tokens, API keys, Basic auth
- **Automatic Retry Logic**: Exponential backoff for failed requests
- **Rate Limit Handling**: Automatic detection and waiting when rate limited
- **Response Caching**: Configurable TTL-based caching for GET requests
- **GraphQL Support**: Built-in GraphQL query execution
- **Custom Headers**: Add any custom headers to requests

## Installation

```bash
ghost extension install .
```

## Configuration

### Set Authentication Token

```bash
ghost api-config --set-token YOUR_API_TOKEN
```

### Set Base URL

```bash
ghost api-config --set-base-url https://api.example.com
```

### Set Authentication Type

```bash
# Options: bearer, apikey, basic
ghost api-config --set-auth-type bearer
```

### Add Custom Headers

```bash
ghost api-config --set-header "X-Custom-Header: value"
```

### Configure Cache TTL

```bash
# Set cache TTL to 5 minutes (in milliseconds)
ghost api-config --cache-ttl 300000
```

### View Configuration

```bash
ghost api-config --show
```

## Usage

### REST API Calls

#### GET Request

```bash
ghost api-call --url https://api.example.com/users --method GET
```

#### POST Request with JSON Data

```bash
ghost api-call --url https://api.example.com/users --method POST --data '{"name":"John","email":"john@example.com"}'
```

#### PUT Request

```bash
ghost api-call --url https://api.example.com/users/123 --method PUT --data '{"name":"Jane"}'
```

#### DELETE Request

```bash
ghost api-call --url https://api.example.com/users/123 --method DELETE
```

### GraphQL Queries

#### Simple Query

```bash
ghost api-call --url https://api.example.com/graphql --graphql --query '{ users { id name } }'
```

#### Query with Variables

```bash
ghost api-call \
  --url https://api.example.com/graphql \
  --graphql \
  --query 'query GetUser($id: ID!) { user(id: $id) { id name email } }' \
  --variables '{"id": "123"}'
```

### Caching

#### Skip Cache

```bash
ghost api-call --url https://api.example.com/data --no-cache
```

#### Custom Cache Key

```bash
ghost api-call --url https://api.example.com/data --cache-key my-custom-key
```

## Advanced Configuration

### Retry Configuration

Edit the `retryConfig` in `index.js`:

```javascript
this.retryConfig = {
    maxRetries: 3,           // Maximum number of retry attempts
    initialDelay: 1000,      // Initial delay in ms
    maxDelay: 30000,         // Maximum delay in ms
    backoffMultiplier: 2     // Exponential backoff multiplier
};
```

### Rate Limit Detection

The extension automatically detects rate limits from these response headers:
- `X-RateLimit-Remaining` / `RateLimit-Remaining`
- `X-RateLimit-Reset` / `RateLimit-Reset`

When rate limited (429 status), it automatically waits until the reset time.

## Example Integration: GitHub API

```bash
# Configure for GitHub
ghost api-config --set-base-url https://api.github.com
ghost api-config --set-token YOUR_GITHUB_TOKEN
ghost api-config --set-header "Accept: application/vnd.github.v3+json"

# Get user info
ghost api-call --url /user --method GET

# List repositories
ghost api-call --url /user/repos --method GET

# Create a repository
ghost api-call --url /user/repos --method POST --data '{"name":"my-repo","private":false}'
```

## Example Integration: Stripe API

```bash
# Configure for Stripe
ghost api-config --set-base-url https://api.stripe.com/v1
ghost api-config --set-token sk_test_YOUR_KEY
ghost api-config --set-auth-type bearer

# List customers
ghost api-call --url /customers --method GET

# Create a customer
ghost api-call --url /customers --method POST --data '{"email":"customer@example.com"}'
```

## Error Handling

The extension handles various error scenarios:

- **Network Errors**: Automatic retry with exponential backoff
- **Rate Limiting (429)**: Waits until rate limit resets
- **Server Errors (5xx)**: Automatic retry
- **Client Errors (4xx)**: No retry, returns error immediately

## Testing

Run the test suite:

```bash
npm test
```

## Development

### Adding Custom Authentication Methods

Extend the `makeRequest` method to support additional auth schemes:

```javascript
if (this.config.authType === 'oauth2') {
    headers['Authorization'] = `OAuth ${this.config.token}`;
}
```

### Custom Response Processors

Add response processing logic in the `makeRequest` method:

```javascript
res.on('end', () => {
    const parsed = this.processResponse(data, res.headers);
    resolve({ data: parsed, headers: res.headers });
});
```

## License

MIT

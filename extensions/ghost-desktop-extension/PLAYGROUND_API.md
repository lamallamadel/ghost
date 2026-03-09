# Extension Playground API Specification

This document describes the backend API endpoints and WebSocket channels required for the Extension Development Playground.

## REST API Endpoints

### Execute Intent

**Endpoint:** `POST /api/playground/execute`

**Request Body:**
```json
{
  "extensionId": "string",
  "intent": {
    "jsonrpc": "2.0",
    "method": "string (type:operation)",
    "params": {},
    "id": "number | string"
  }
}
```

**Response:**
```json
{
  "success": true,
  "result": {},
  "duration": 123
}
```

or

```json
{
  "success": false,
  "error": "Error message",
  "duration": 123
}
```

### Validate Intent

**Endpoint:** `POST /api/playground/validate`

**Request Body:**
```json
{
  "extensionId": "string",
  "intent": {
    "type": "string",
    "operation": "string",
    "params": {}
  }
}
```

**Response:**
```json
{
  "success": true,
  "validationErrors": []
}
```

or

```json
{
  "success": false,
  "validationErrors": [
    {
      "field": "string",
      "message": "string",
      "severity": "error | warning"
    }
  ]
}
```

### Validate Manifest

**Endpoint:** `POST /api/playground/manifest/validate`

**Request Body:**
```json
{
  "manifest": {
    "id": "string",
    "name": "string",
    "version": "string",
    "main": "string",
    "capabilities": {},
    "permissions": {}
  }
}
```

**Response:**
```json
{
  "valid": true,
  "errors": []
}
```

## WebSocket Channels

### RPC Inspector

**Endpoint:** `ws://localhost:9876/ws/rpc-inspector`

**Message Format:**
```json
{
  "timestamp": 1234567890,
  "direction": "request | response",
  "extensionId": "string",
  "method": "string",
  "params": {},
  "result": {},
  "error": {
    "code": -32603,
    "message": "string",
    "data": {}
  },
  "duration": 123,
  "requestId": "number | string"
}
```

**Server -> Client:**
Sends RPC messages (both requests and responses) as they occur during extension execution.

### Pipeline Execution

**Endpoint:** `ws://localhost:9876/ws/pipeline`

**Message Format:**
```json
{
  "id": "string",
  "extensionId": "string",
  "method": "string",
  "timestamp": 1234567890,
  "status": "running | completed | failed",
  "stages": {
    "gateway": {
      "name": "gateway",
      "status": "pending | running | completed | failed",
      "duration": 123,
      "timestamp": 1234567890,
      "details": {},
      "error": "string"
    },
    "auth": { /* same structure */ },
    "audit": { /* same structure */ },
    "execute": { /* same structure */ }
  },
  "totalDuration": 456
}
```

**Server -> Client:**
Sends pipeline execution updates as stages progress. Can send multiple updates for the same execution ID as stages complete.

## Implementation Notes

### Mock Server

The frontend includes a mock server (`mockPlaygroundServer.ts`) that simulates these endpoints for development and testing. It automatically activates when the real backend is unavailable.

### Integration with Ghost Runtime

The backend should integrate with the Ghost extension runtime to:

1. **Intent Execution**: Route intents through the full pipeline (gateway → auth → audit → execute)
2. **RPC Monitoring**: Capture all JSON-RPC messages between the playground and extensions
3. **Pipeline Tracking**: Monitor and report on each pipeline stage's execution
4. **Manifest Validation**: Use the existing manifest validation logic

### Example Implementation (Node.js/Express)

```javascript
// Express route for intent execution
app.post('/api/playground/execute', async (req, res) => {
  const { extensionId, intent } = req.body;
  
  try {
    // Execute through the pipeline
    const result = await extensionRuntime.callExtension(
      extensionId, 
      intent.method, 
      intent.params
    );
    
    res.json({ 
      success: true, 
      result,
      duration: Date.now() - startTime 
    });
  } catch (error) {
    res.json({ 
      success: false, 
      error: error.message,
      duration: Date.now() - startTime 
    });
  }
});

// WebSocket for RPC monitoring
wss.on('connection', (ws, req) => {
  if (req.url === '/ws/rpc-inspector') {
    const listener = (message) => {
      ws.send(JSON.stringify(message));
    };
    
    extensionRuntime.on('rpc-message', listener);
    
    ws.on('close', () => {
      extensionRuntime.off('rpc-message', listener);
    });
  }
});
```

### Security Considerations

1. **Sandbox Mode**: The playground should execute extensions in sandbox mode by default
2. **Permission Checks**: Validate all capabilities and permissions before execution
3. **Rate Limiting**: Implement rate limiting to prevent abuse
4. **Logging**: Log all playground activity for security auditing

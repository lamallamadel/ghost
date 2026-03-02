# Extension Development Playground

An interactive development environment for building and testing Ghost extensions without writing code.

## Features

### 🎯 Intent Builder

Build and execute extension intents with a visual interface:

- **Template Library**: Pre-built templates for common operations (filesystem, network, git)
- **Live Execution**: Execute intents and see results in real-time
- **JSON Editor**: Edit parameters with syntax highlighting
- **Result Visualization**: Pretty-printed JSON responses
- **Save & Reuse**: Save frequently used intents for quick access
- **Code Export**: Generate SDK code from visual intent builder

**Supported Operations:**

- **Filesystem**: read, write, readdir, stat, mkdir, unlink, rmdir
- **Network**: HTTP/HTTPS requests (GET, POST, PUT, DELETE, PATCH)
- **Git**: status, log, diff, commit, add, push, checkout, show

### 🔍 RPC Inspector

Monitor live JSON-RPC traffic between extensions and the Ghost runtime:

- **Real-time Monitoring**: See all RPC messages as they happen
- **Request-Response Pairing**: Automatically links requests with their responses
- **Filtering**: Search and filter messages by extension, method, or content
- **Export**: Download message history as JSON for analysis
- **Pause/Resume**: Control message capture
- **Message Details**: View complete JSON-RPC envelope with metadata

### 🔄 Pipeline Visualizer

Visualize the Ghost extension execution pipeline:

- **Stage Tracking**: Monitor Gateway → Auth → Audit → Execute stages
- **Performance Metrics**: See duration for each pipeline stage
- **Error Detection**: Identify which stage failed and why
- **Live Updates**: Watch pipeline execution in real-time
- **Visual Flow**: Color-coded stages show execution status
- **Performance Breakdown**: Bar chart showing time spent in each stage

**Pipeline Stages:**

1. **Gateway**: Intercepts and validates intent structure
2. **Auth**: Checks extension permissions and capabilities
3. **Audit**: Logs operation for compliance and debugging
4. **Execute**: Performs the actual operation

### 📝 Manifest Editor

Create and validate extension manifests with real-time feedback:

- **Template Gallery**: Start from pre-built templates
- **Real-time Validation**: Instant feedback on errors and warnings
- **Schema Documentation**: Inline field documentation
- **Format & Prettify**: Auto-format JSON with one click
- **Import/Export**: Load and save manifest files
- **Capability Descriptions**: Learn what each capability enables

**Templates:**

- **Basic Extension**: Minimal manifest structure
- **API Integration**: Network-enabled extension
- **File Processor**: Filesystem operations
- **Git Workflow**: Git automation extension

## Usage

### Intent Builder Workflow

1. Select an intent type (filesystem, network, git)
2. Choose an operation or load a template
3. Edit parameters in the JSON editor
4. Click "Execute Intent" to run
5. View results and execution time
6. Save successful intents for reuse

### RPC Inspector Workflow

1. Start the inspector (automatically recording)
2. Execute intents from the Intent Builder
3. Watch RPC messages appear in real-time
4. Click any message to see full details
5. Use filters to find specific messages
6. Export data for offline analysis

### Pipeline Visualizer Workflow

1. Enable live mode (default)
2. Execute an intent
3. Watch the pipeline stages progress
4. Click an execution to see detailed breakdown
5. Review performance metrics
6. Identify bottlenecks or failures

### Manifest Editor Workflow

1. Choose a template or start from scratch
2. Edit the manifest JSON
3. Watch for validation errors (if auto-validate is on)
4. Fix any errors or warnings
5. Download the manifest file
6. Use with `ghost extension init`

## Mock Server

The playground includes a built-in mock server that simulates the Ghost backend when it's unavailable. This enables development and testing without a running Ghost instance.

**Features:**

- Simulates all intent types (filesystem, network, git)
- Generates realistic responses
- Tracks RPC messages and pipeline executions
- Automatic fallback when backend is unavailable

**Simulated Operations:**

- **Filesystem**: Mock file contents, directory listings, stats
- **Network**: Mock HTTP responses with configurable data
- **Git**: Mock repository status, commits, diffs

## Integration with Ghost Runtime

To integrate with a real Ghost backend, implement the API endpoints and WebSocket channels documented in `desktop/PLAYGROUND_API.md`.

**Required Endpoints:**

- `POST /api/playground/execute` - Execute intent
- `POST /api/playground/validate` - Validate intent
- `POST /api/playground/manifest/validate` - Validate manifest

**WebSocket Channels:**

- `ws://localhost:9876/ws/rpc-inspector` - RPC message stream
- `ws://localhost:9876/ws/pipeline` - Pipeline execution updates

## Development

### Adding New Templates

Edit `IntentBuilder.tsx`:

```typescript
const INTENT_TEMPLATES = {
  filesystem: [
    {
      name: 'My Template',
      type: 'filesystem',
      operation: 'read',
      params: { path: 'example.txt' },
      description: 'Template description'
    }
  ]
};
```

### Extending Mock Server

Edit `mockPlaygroundServer.ts`:

```typescript
private simulateFilesystem(operation: string, params: unknown): unknown {
  switch (operation) {
    case 'custom-operation':
      return { /* custom response */ };
  }
}
```

### Adding Manifest Validation Rules

Edit `ManifestEditor.tsx`:

```typescript
const validateManifest = async () => {
  // Add custom validation logic
  if (customCheck(manifest)) {
    errors.push({ field: 'custom', message: 'Error', severity: 'error' });
  }
};
```

## Tips & Best Practices

1. **Use Templates**: Start with templates to learn the structure
2. **Save Intents**: Save working intents for quick testing
3. **Monitor RPC**: Keep RPC Inspector open to debug issues
4. **Check Pipeline**: Use Pipeline Visualizer to find performance bottlenecks
5. **Validate Early**: Enable auto-validate in Manifest Editor
6. **Export Data**: Export RPC messages for documentation
7. **Copy as Code**: Use "Copy as Code" to generate SDK snippets

## Keyboard Shortcuts

- `Ctrl/Cmd + S` - Save current intent (Intent Builder)
- `Ctrl/Cmd + Enter` - Execute intent (Intent Builder)
- `Ctrl/Cmd + K` - Clear messages (RPC Inspector)
- `Ctrl/Cmd + F` - Format JSON (Manifest Editor)

## Troubleshooting

**Intent execution fails:**
- Check the RPC Inspector for error details
- Verify manifest has required capabilities
- Check Pipeline Visualizer for which stage failed

**No RPC messages appearing:**
- Ensure you're executing intents
- Check if recording is paused
- Verify WebSocket connection (or mock server is active)

**Manifest validation errors:**
- Read error messages carefully
- Check schema documentation in sidebar
- Compare with working templates

**Pipeline not showing executions:**
- Ensure live mode is enabled
- Execute an intent to generate data
- Check WebSocket connection status

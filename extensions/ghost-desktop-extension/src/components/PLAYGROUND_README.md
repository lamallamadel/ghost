# Enhanced Extension Development Playground

Comprehensive interactive development environment for Ghost CLI extensions with real-time monitoring, visual builders, and performance profiling.

## Components

### EnhancedPlayground
Main container component that provides tabbed navigation between all playground features.

**Features:**
- Unified interface for all extension development tools
- Tabbed navigation for easy switching between tools
- Integrated with existing IntentPlayground and ProfilingDashboard

### 1. Intent Builder (IntentPlayground)
Text-based intent builder with template support and execution.

**Features:**
- Pre-built templates for filesystem, network, and git operations
- JSON parameter editor with syntax validation
- Validate and execute intents directly
- View execution results with timing information

### 2. Visual Intent Builder (VisualIntentBuilder)
Drag-and-drop visual flow builder using React Flow.

**Features:**
- Visual node-based intent composition
- Drag-and-drop interface for building workflows
- Support for filesystem, network, git, and process operations
- Connect nodes to create execution flows
- Edit node properties in real-time
- Save and export flow definitions as JSON
- Execute entire flows through the API

**Node Types:**
- **Filesystem** (blue): read, write, readdir, stat, mkdir, unlink
- **Network** (green): request, get, post, put, delete
- **Git** (purple): status, log, diff, commit, push, pull, branch
- **Process** (orange): exec, spawn, kill

### 3. RPC Inspector (RPCInspector)
Real-time request/response monitoring with syntax highlighting.

**Features:**
- Live stream of RPC messages via Server-Sent Events
- Split-panel view: message list + detailed view
- Syntax-highlighted JSON payloads
- Filter messages by method or extension
- Auto-scroll option for real-time monitoring
- Display request/response metadata
- Show pipeline stage information
- Duration tracking for each message

**Metadata Displayed:**
- Message ID and direction (request/response)
- Extension ID
- Method name
- Timestamp
- Duration
- Pipeline stage and status

### 4. Pipeline Visualizer (PipelineVisualizer)
Visual representation of requests flowing through pipeline stages.

**Features:**
- Real-time pipeline stage tracking
- Color-coded status indicators:
  - **Green**: Success
  - **Red**: Failure
  - **Yellow**: Warning
  - **Gray**: Pending
- Stage-by-stage visualization:
  - Intercept → Auth → Audit → Execute
- Detailed stage information with messages
- Request filtering and search
- Overall request status tracking

**Pipeline Stages:**
1. **Intercept**: Schema validation and message normalization
2. **Auth**: Permission checking and rate limiting
3. **Audit**: Security event logging and NIST validation
4. **Execute**: Operation execution with circuit breakers

### 5. Manifest Editor (ManifestEditor)
Interactive manifest.json editor with real-time validation.

**Features:**
- Live JSON editor with line numbers
- Real-time validation feedback (500ms debounce)
- Load existing manifests by extension ID
- Save manifests directly to extensions
- Quick-add capability templates:
  - Filesystem capabilities
  - Network capabilities with domain restrictions
  - Git operation capabilities
  - Process execution capabilities
- Inline error display with path and severity
- Capability warnings for security concerns
- Auto-validate toggle option

**Validation Features:**
- JSON syntax checking
- Schema validation
- Capability permission warnings
- Required field checking
- Type validation

### 6. Hot Reload Manager (HotReloadManager)
Extension hot-reload control with state preservation.

**Features:**
- Enable/disable hot reload per extension
- Manual reload trigger
- Preserve pending request state during reload
- Configurable reload delay (0-2000ms)
- File watching status display
- Pending request counter
- Last reload timestamp
- List of watched files per extension

**Settings:**
- **Preserve State**: Keep pending requests and restore after reload
- **Reload Delay**: Debounce time after file changes

### 7. Performance Profiler (ProfilingDashboard)
CPU, memory, and execution time profiling with flamegraph visualization.

**Features:**
- Real-time CPU and memory metrics
- Execution statistics (total calls, avg/max duration)
- Flamegraph visualization of call stacks
- Bottleneck detection
- Recent execution history
- Per-extension profiling
- Memory history tracking
- Reset metrics per extension or globally

**Metrics Tracked:**
- CPU: Usage percentage, total time, sample count
- Memory: Heap used/total, external, RSS
- Execution: Call count, duration statistics
- Bottlenecks: Slow operations over threshold

## API Endpoints

The playground components connect to these API endpoints:

### RPC Inspector
- `GET /api/rpc/stream` - Server-Sent Events stream for RPC messages

### Pipeline Visualizer
- `GET /api/pipeline/stream` - SSE stream for pipeline requests

### Intent Execution
- `POST /api/playground/validate` - Validate intent
- `POST /api/playground/execute` - Execute intent
- `POST /api/flow/execute` - Execute visual flow

### Manifest Management
- `GET /api/manifest/:extensionId` - Load manifest
- `PUT /api/manifest/:extensionId` - Save manifest
- `POST /api/manifest/validate` - Validate manifest

### Hot Reload
- `GET /api/extensions/status` - Get extension status
- `POST /api/extensions/:extensionId/hot-reload` - Toggle hot reload
- `POST /api/extensions/:extensionId/reload` - Manual reload
- `POST /api/extensions/hot-reload/settings` - Update settings

### Profiling
- `GET /api/profiling/metrics` - Get all metrics
- `GET /api/profiling/flamegraph/:extensionId` - Get flamegraph data
- `POST /api/profiling/reset` - Reset all metrics
- `POST /api/profiling/reset/:extensionId` - Reset extension metrics

## Integration

The Enhanced Playground is integrated into the DeveloperTab and replaces the previous simple IntentPlayground with a comprehensive suite of development tools.

**Access via:**
1. Open Ghost Desktop app
2. Navigate to Developer tab
3. Select Playground view
4. Use sub-tabs to access individual tools

## Technology Stack

- **React 18** with TypeScript
- **React Flow** for visual flow builder
- **Lucide React** for icons
- **TailwindCSS** for styling
- **Server-Sent Events** for real-time data streaming
- **Zustand** for state management (if needed)

## Development Notes

- All components use consistent dark theme (gray-800/900)
- Real-time updates via polling or SSE
- Responsive layouts with split panels
- Syntax highlighting for JSON payloads
- Error handling for API failures
- Loading states for async operations

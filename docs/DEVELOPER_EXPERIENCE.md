# Developer Experience Enhancements

## Overview

Ghost CLI now includes comprehensive developer tools designed to accelerate extension development with hot-reload, advanced debugging, interactive testing, and performance profiling capabilities.

## Features

### 1. Hot Module Reloading

Automatically detect and reload extensions when code or manifest changes are detected.

**Features:**
- Watch manifest.json for configuration changes
- Watch all .js files in extension directory
- Automatic runtime reload without restarting gateway
- Preserves extension state where possible

**Usage:**
```bash
# Enable developer mode (includes hot reload)
ghost devmode enable

# Dev mode is automatically enabled when using extension development workflow
```

**Implementation:**
- `core/dev-mode.js` - DevMode class with hot reload configuration
- `core/dev-mode.js` - HotReloadWatcher for file system monitoring
- Integrates with runtime to trigger graceful restarts

### 2. Extension Debugger

Attach Node.js debugger to running extensions with full breakpoint support.

**Features:**
- Attach/detach debugger to any running extension
- Set breakpoints with optional conditions
- View inspector URL for Chrome DevTools
- Monitor extension process state

**Usage:**

Via Desktop App:
1. Open Ghost Console (`ghost console start`)
2. Navigate to Developer tab
3. Select Debugger view
4. Choose extension and click "Attach Debugger"
5. Click "Open DevTools" to launch Chrome inspector

Via API:
```bash
# Attach debugger
curl -X POST http://localhost:9876/api/debugger/my-extension/attach

# Add breakpoint
curl -X POST http://localhost:9876/api/debugger/my-extension/breakpoint \
  -H "Content-Type: application/json" \
  -d '{"scriptPath":"index.js","line":42}'

# Detach debugger
curl -X POST http://localhost:9876/api/debugger/my-extension/detach
```

**Implementation:**
- `core/debugger-adapter.js` - ExtensionDebugger and DebuggerManager
- `desktop/src/components/ExtensionDebugger.tsx` - React UI component
- Uses Node.js Inspector Protocol (SIGUSR1 signal)

### 3. Intent Playground

Interactive component for crafting and testing JSON-RPC intents with real-time validation.

**Features:**
- Template library for common intents (filesystem, network, git)
- Real-time JSON validation
- Execute intents against running extensions
- View execution results and errors
- Performance timing information

**Usage:**

Via Desktop App:
1. Open Ghost Console
2. Navigate to Developer tab
3. Select Playground view
4. Choose intent type and operation
5. Customize parameters
6. Click "Validate" or "Execute"

Via API:
```bash
# Validate intent
curl -X POST http://localhost:9876/api/playground/validate \
  -H "Content-Type: application/json" \
  -d '{
    "extensionId": "my-extension",
    "intent": {
      "type": "filesystem",
      "operation": "read",
      "params": {"path": "README.md"}
    }
  }'

# Execute intent
curl -X POST http://localhost:9876/api/playground/execute \
  -H "Content-Type: application/json" \
  -d '{
    "extensionId": "my-extension",
    "intent": {
      "type": "filesystem",
      "operation": "read",
      "params": {"path": "README.md"}
    }
  }'
```

**Implementation:**
- `desktop/src/components/IntentPlayground.tsx` - React UI component
- Integrates with pipeline for validation and execution
- Template library built-in for quick testing

### 4. Profiling Dashboard

Comprehensive performance monitoring with CPU, memory, and bottleneck identification.

**Features:**
- Real-time CPU usage tracking
- Memory consumption monitoring (heap, RSS, external)
- Execution statistics (call count, avg/max duration)
- Bottleneck detection (operations > 500ms)
- Flamegraph visualization for performance analysis

**Metrics Collected:**
- **CPU:** Total time, average usage percentage
- **Memory:** Heap used/total, external memory, RSS
- **Execution:** Total calls, average duration, max duration
- **Bottlenecks:** Slow operations with timestamps

**Usage:**

Via Desktop App:
1. Open Ghost Console
2. Navigate to Developer tab
3. Select Profiling view
4. View real-time metrics and flamegraphs

Via API:
```bash
# Get all metrics
curl http://localhost:9876/api/profiling/metrics

# Get flamegraph for extension
curl http://localhost:9876/api/profiling/flamegraph/my-extension

# Reset metrics
curl -X POST http://localhost:9876/api/profiling/reset/my-extension
```

**Implementation:**
- `core/profiler.js` - ExtensionProfiler and ProfilingManager
- `desktop/src/components/ProfilingDashboard.tsx` - React UI with visualizations
- Automatic profiling when developer mode enabled

### 5. Developer Mode

Special mode that disables rate limiting and relaxes validation for faster iteration.

**Features:**
- Bypass rate limiting
- Relaxed validation rules
- Hot reload enabled by default
- Debug logging enabled

**Usage:**
```bash
# Enable developer mode
ghost devmode enable

# Disable developer mode
ghost devmode disable

# Check status
curl http://localhost:9876/api/devmode/status
```

**API Endpoints:**
```bash
GET  /api/devmode/status        # Get current config
POST /api/devmode/enable        # Enable developer mode
POST /api/devmode/disable       # Disable developer mode
```

**Implementation:**
- `core/dev-mode.js` - DevMode class
- Integrates with pipeline to bypass checks
- Emits events for mode changes

### 6. Extension Template Wizard

Interactive CLI wizard for scaffolding new extensions with best practices.

**Features:**
- Interactive prompts for configuration
- Multiple template types (Basic, TypeScript, Advanced)
- Automatic capability selection
- Boilerplate generation with tests
- Best practices built-in

**Templates:**
- **Basic:** Simple JavaScript extension
- **TypeScript:** TypeScript with build configuration
- **Advanced:** Full-featured with test framework

**Usage:**
```bash
# Launch interactive wizard
ghost extension init

# Follow prompts to configure:
# - Extension name and ID
# - Description and author
# - Capabilities (filesystem, network, git, process)
# - Commands to implement
# - Template type
```

**Generated Structure:**
```
my-extension/
├── manifest.json          # Extension manifest
├── index.js               # Main entry point (or src/index.ts)
├── package.json           # NPM dependencies (if applicable)
├── tsconfig.json          # TypeScript config (if TypeScript)
├── test/                  # Test directory (if Advanced)
│   └── index.test.js
├── README.md              # Documentation
└── .gitignore             # Git ignore rules
```

**Implementation:**
- `core/template-wizard.js` - TemplateWizard class
- `ghost.js` - CLI integration
- Generates complete project structure

## Desktop App Integration

All developer tools are accessible through the Ghost Console desktop app.

**Launch Console:**
```bash
ghost console start --port 9876
```

**Developer Tab:**
- **Playground:** Test intents interactively
- **Debugger:** Attach Node.js debugger with breakpoints
- **Profiling:** View performance metrics and flamegraphs

**Navigation:**
```
Console > Developer Tab > [Playground | Debugger | Profiling]
```

## API Reference

### Debugger API

```
GET  /api/debugger/:extensionId
POST /api/debugger/:extensionId/attach
POST /api/debugger/:extensionId/detach
POST /api/debugger/:extensionId/breakpoint
DELETE /api/debugger/:extensionId/breakpoint/:breakpointId
```

### Profiling API

```
GET  /api/profiling/metrics
GET  /api/profiling/flamegraph/:extensionId
POST /api/profiling/reset/:extensionId?
```

### Playground API

```
POST /api/playground/validate
POST /api/playground/execute
```

### Developer Mode API

```
GET  /api/devmode/status
POST /api/devmode/enable
POST /api/devmode/disable
```

## Architecture

### Hot Reload Flow

```
File Change → HotReloadWatcher
              ↓
         manifest-changed or code-changed event
              ↓
         Runtime → Stop Extension
              ↓
         Gateway → Reload Extension
              ↓
         Runtime → Start Extension
```

### Profiler Integration

```
Extension Call → Profiler.recordExecution()
                 ↓
            CPU/Memory Sampling (100ms/500ms intervals)
                 ↓
            Bottleneck Detection (>500ms)
                 ↓
            Metrics Aggregation
                 ↓
            API/Dashboard Display
```

### Debugger Attachment

```
User Request → DebuggerManager.attachDebugger()
               ↓
          Send SIGUSR1 to Extension Process
               ↓
          Node Inspector Enabled
               ↓
          Generate Inspector URL
               ↓
          Return chrome-devtools:// link
```

## Best Practices

### During Development

1. **Enable Developer Mode:**
   ```bash
   ghost devmode enable
   ```

2. **Use Template Wizard:**
   ```bash
   ghost extension init
   ```

3. **Test with Playground:**
   - Validate intents before implementing
   - Test edge cases interactively

4. **Profile Early:**
   - Monitor performance from the start
   - Identify bottlenecks before they become issues

5. **Debug Systematically:**
   - Use breakpoints instead of console.log
   - Leverage Chrome DevTools full power

### Production Deployment

1. **Disable Developer Mode:**
   ```bash
   ghost devmode disable
   ```

2. **Remove Debug Code:**
   - No console.log statements
   - No debug-only logic

3. **Validate Performance:**
   - Review profiling metrics
   - Ensure no bottlenecks >500ms

4. **Test Without Relaxed Validation:**
   - Ensure compliance with security policies
   - Verify rate limiting behavior

## Troubleshooting

### Hot Reload Not Working

**Issue:** Changes not detected
**Solution:** 
- Check file watcher limits: `ulimit -n` (increase if needed)
- Verify dev mode is enabled
- Check file permissions

### Debugger Won't Attach

**Issue:** SIGUSR1 signal fails
**Solution:**
- Ensure extension is running
- Check process permissions
- Verify port not in use

### Profiler Shows No Data

**Issue:** Metrics not collected
**Solution:**
- Ensure extension is active
- Verify profiling manager started
- Check telemetry server running

### Playground Execution Fails

**Issue:** Intent execution error
**Solution:**
- Validate JSON syntax
- Check extension capabilities match intent type
- Verify extension is running

## Performance Impact

### Developer Mode Overhead

- **Hot Reload:** ~5MB memory, negligible CPU
- **Profiler:** ~10MB memory, 2-5% CPU overhead
- **Debugger:** ~15MB memory when attached, 0% when detached

### Production Recommendations

- Disable all dev tools in production
- Use telemetry for production monitoring
- Profile in staging environment

## Future Enhancements

- [ ] VSCode extension for integrated debugging
- [ ] Remote debugging support
- [ ] Performance regression testing
- [ ] Automated bottleneck alerts
- [ ] Profiler snapshots and comparison
- [ ] Hot reload for manifest-only changes (no restart)

## Related Documentation

- [Extension API Reference](./extension-api.md)
- [Extension Examples](./extension-examples.md)
- [Developer Toolkit Guide](./DEVELOPER_TOOLKIT.md)
- [Quick Reference](./QUICK_REFERENCE.md)

# File Processor Template

A comprehensive template for batch file operations with progress tracking, streaming support for large files, and glob pattern matching.

## Features

- **Batch Processing**: Process multiple files concurrently with configurable concurrency
- **Progress Events**: Real-time progress tracking for long-running operations
- **Streaming Support**: Efficiently handle large files without loading into memory
- **Glob Patterns**: Match files using flexible glob patterns (`**/*.txt`, `src/**/*.js`)
- **Recursive Traversal**: Automatically traverse directory structures
- **Error Recovery**: Continue processing even if individual files fail
- **Line-by-Line Processing**: Process files line by line for text operations
- **Dry Run Mode**: Preview what would be processed without making changes

## Installation

```bash
ghost extension install .
```

## Usage

### Process Files with Pattern Matching

#### Basic File Processing

```bash
# Convert all .txt files to uppercase
ghost process-files --pattern "**/*.txt" --operation uppercase

# Process specific directory
ghost process-files --pattern "src/**/*.js" --operation minify --output dist/
```

#### With Options

```bash
# Dry run to see what would be processed
ghost process-files --pattern "**/*.md" --operation lowercase --dry-run

# Control concurrency
ghost process-files --pattern "**/*.json" --operation minify --concurrency 10

# Non-recursive (current directory only)
ghost process-files --pattern "*.txt" --operation trim --recursive false
```

### Batch Transform Files

Transform files from one directory to another:

```bash
# Basic transform
ghost batch-transform --input "src/**/*.js" --output dist/

# Preserve directory structure
ghost batch-transform \
  --input "src/**/*.ts" \
  --output dist/ \
  --preserve-structure \
  --transform minify
```

### Stream Large Files

Efficiently process large files:

```bash
# Stream by chunks (default 64KB)
ghost stream-large-file --input large-data.txt --output processed.txt

# Process line by line
ghost stream-large-file \
  --input huge-log.txt \
  --output cleaned-log.txt \
  --line-by-line \
  --transform trim

# Custom chunk size
ghost stream-large-file \
  --input video.mp4 \
  --output compressed.mp4 \
  --chunk-size 1048576
```

## Built-in Operations

The template includes these built-in operations:

- **uppercase**: Convert text to uppercase
- **lowercase**: Convert text to lowercase
- **trim**: Remove leading/trailing whitespace
- **minify**: Collapse whitespace to single spaces
- **copy**: Copy file without modification (default)

## Glob Patterns

Supported glob patterns:

- `*` - Matches any characters except path separators
- `**` - Matches any characters including path separators (recursive)
- `?` - Matches a single character
- `*.txt` - All .txt files in current directory
- `**/*.js` - All .js files in any subdirectory
- `src/**/*.test.js` - All .test.js files under src/

## Progress Events

The extension emits progress events that can be monitored:

```javascript
extension.on('progress', (state) => {
  console.log(`Processed: ${state.processed}/${state.total}`);
  console.log(`Failed: ${state.failed}`);
});
```

## Advanced Usage

### Custom Operations

Extend the `applyOperation` method to add custom operations:

```javascript
async applyOperation(content, operation) {
    switch (operation) {
        case 'remove-comments':
            return content.replace(/\/\/.*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
        case 'add-header':
            return `// Generated file\n${content}`;
        default:
            return content;
    }
}
```

### Custom Transforms

Add sophisticated transforms:

```javascript
async applyTransform(content, transform) {
    switch (transform) {
        case 'json-format':
            return JSON.stringify(JSON.parse(content), null, 2);
        case 'csv-to-json':
            return this.csvToJson(content);
        case 'markdown-to-html':
            return this.markdownToHtml(content);
        default:
            return content;
    }
}
```

### Error Handling

Access detailed error information from results:

```javascript
const result = await extension['process-files'](params);

if (!result.success) {
    console.log('Failures:');
    result.summary.errors.forEach(err => {
        console.log(`  ${err.file}: ${err.error}`);
    });
}
```

## Examples

### Example 1: Clean Up Log Files

```bash
# Remove whitespace from all log files
ghost process-files \
  --pattern "logs/**/*.log" \
  --operation trim \
  --output cleaned-logs/
```

### Example 2: Minify JavaScript Files

```bash
# Minify all JS files for production
ghost batch-transform \
  --input "src/**/*.js" \
  --output dist/ \
  --preserve-structure \
  --transform minify
```

### Example 3: Process Large CSV

```bash
# Stream process large CSV file
ghost stream-large-file \
  --input data.csv \
  --output cleaned-data.csv \
  --line-by-line \
  --transform trim
```

### Example 4: Convert Case of All Markdown

```bash
# Convert all markdown headers to uppercase
ghost process-files \
  --pattern "docs/**/*.md" \
  --operation uppercase \
  --concurrency 3
```

## Performance Tips

1. **Adjust Concurrency**: Increase `--concurrency` for I/O-bound operations
2. **Use Streaming**: For files > 100MB, use `stream-large-file`
3. **Batch Operations**: Group related operations to minimize I/O
4. **Dry Run First**: Always test with `--dry-run` before processing
5. **Chunk Size**: Adjust `--chunk-size` based on available memory

## Testing

Run the test suite:

```bash
npm test
```

Watch mode for development:

```bash
npm run test:watch
```

## Development

### Adding New Operations

1. Add operation to `applyOperation` method
2. Document in README
3. Add test case
4. Update help text

### Monitoring Progress

Hook into progress events:

```javascript
extension.on('progress', (data) => {
  // Update UI, send notifications, etc.
});
```

## Error Handling

The extension handles errors gracefully:

- Individual file failures don't stop batch processing
- All errors are collected in `summary.errors`
- Failed file count tracked separately
- Detailed error messages for debugging

## License

MIT

const path = require('path');
const os = require('os');
const DependencyResolver = require('./dependency-resolver');
const ExtensionLoader = require('./extension-loader');

/**
 * Extension Dependency Commands Handler
 * Provides CLI commands for viewing and managing extension dependencies
 */
class ExtensionDepsCommands {
    constructor(colors) {
        this.Colors = colors;
        this.USER_EXTENSIONS_DIR = path.join(os.homedir(), '.ghost', 'extensions');
    }

    /**
     * Handle deps command - show dependency tree
     */
    async handleDepsCommand(parsedArgs) {
        const extId = parsedArgs.args[0];
        const loader = new ExtensionLoader(this.USER_EXTENSIONS_DIR);
        const graphData = loader.loadDependencyGraph();
        
        if (!graphData) {
            console.error(`${this.Colors.FAIL}Error: No dependency graph found. Extensions may need to be reloaded.${this.Colors.ENDC}`);
            process.exit(1);
        }

        if (parsedArgs.flags.json) {
            console.log(JSON.stringify(graphData, null, 2));
            return;
        }

        console.log(`\n${this.Colors.BOLD}${this.Colors.CYAN}Extension Dependency Tree${this.Colors.ENDC}`);
        console.log(`${this.Colors.DIM}${'─'.repeat(80)}${this.Colors.ENDC}\n`);

        if (extId) {
            this._showExtensionTree(graphData, extId);
        } else {
            this._showAllExtensions(graphData);
        }
    }

    /**
     * Show dependency tree for a specific extension
     */
    _showExtensionTree(graphData, extId) {
        const resolver = new DependencyResolver();
        const graph = new Map(Object.entries(graphData.graph || {}));
        
        if (!graph.has(extId)) {
            console.error(`${this.Colors.FAIL}Error: Extension ${extId} not found${this.Colors.ENDC}`);
            process.exit(1);
        }

        console.log(`${this.Colors.BOLD}${extId}${this.Colors.ENDC}\n`);
        const tree = resolver.generateDependencyTree(graph, extId);
        console.log(tree);

        const allDeps = resolver.getAllDependencies(graph, extId);
        if (allDeps.size > 0) {
            console.log(`\n${this.Colors.DIM}Total dependencies: ${allDeps.size}${this.Colors.ENDC}`);
        } else {
            console.log(`${this.Colors.DIM}No dependencies${this.Colors.ENDC}`);
        }
    }

    /**
     * Show all extensions with their dependencies
     */
    _showAllExtensions(graphData) {
        const loadOrder = graphData.loadOrder || [];
        
        loadOrder.forEach((id, index) => {
            const node = graphData.graph ? graphData.graph[id] : null;
            if (!node) return;

            const deps = Object.keys(node.dependencies || {});
            const depCount = deps.length;
            
            console.log(`${this.Colors.BOLD}${index + 1}.${this.Colors.ENDC} ${id}@${node.version}`);
            
            if (depCount > 0) {
                console.log(`   ${this.Colors.DIM}Dependencies (${depCount}):${this.Colors.ENDC}`);
                deps.forEach(depId => {
                    const constraint = node.dependencies[depId];
                    console.log(`   └─ ${depId}@${constraint}`);
                });
            } else {
                console.log(`   ${this.Colors.DIM}No dependencies${this.Colors.ENDC}`);
            }
            console.log('');
        });

        this._showConflicts(graphData);
        this._showVersionIssues(graphData);

        console.log(`${this.Colors.DIM}Load Order: ${loadOrder.join(' → ')}${this.Colors.ENDC}`);
        console.log(`${this.Colors.DIM}Generated: ${graphData.timestamp}${this.Colors.ENDC}\n`);
    }

    /**
     * Show capability conflicts
     */
    _showConflicts(graphData) {
        if (graphData.conflicts && graphData.conflicts.length > 0) {
            console.log(`\n${this.Colors.WARNING}${this.Colors.BOLD}Capability Conflicts (${graphData.conflicts.length}):${this.Colors.ENDC}`);
            graphData.conflicts.forEach(conflict => {
                console.log(`  ${this.Colors.WARNING}●${this.Colors.ENDC} ${conflict.type}: ${conflict.extensions.join(', ')}`);
                console.log(`    Resolution: ${conflict.resolution}`);
                if (conflict.winner) {
                    console.log(`    Winner: ${conflict.winner}`);
                }
            });
            console.log('');
        }
    }

    /**
     * Show version constraint issues
     */
    _showVersionIssues(graphData) {
        if (graphData.versionIssues && graphData.versionIssues.length > 0) {
            console.log(`\n${this.Colors.WARNING}${this.Colors.BOLD}Version Constraint Issues (${graphData.versionIssues.length}):${this.Colors.ENDC}`);
            graphData.versionIssues.forEach(issue => {
                console.log(`  ${this.Colors.WARNING}●${this.Colors.ENDC} ${issue.extension} → ${issue.dependency}`);
                console.log(`    Requires: ${issue.constraint}, Found: ${issue.installed || 'not installed'}`);
            });
            console.log('');
        }
    }
}

module.exports = ExtensionDepsCommands;

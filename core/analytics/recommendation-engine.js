const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * RecommendationEngine - AI-powered extension marketplace recommendation system
 * 
 * Analyzes repository characteristics to suggest relevant extensions:
 * - Detects languages from package.json, requirements.txt, go.mod
 * - Identifies frameworks from dependency manifests
 * - Analyzes file patterns using git ls-files
 * - Evaluates Git history complexity (commit count, branches, contributors)
 * - Generates confidence-scored recommendations with repository profile matching
 * - Tracks installation conversion rates per recommendation
 * 
 * Usage:
 *   const engine = new RecommendationEngine();
 *   const profile = await engine.analyzeRepository('/path/to/repo');
 *   const recommendations = await engine.generateRecommendations();
 *   const top5 = engine.getTopRecommendations(5);
 * 
 * Static usage:
 *   const top5 = await RecommendationEngine.getTopRecommendations('/path/to/repo', 5);
 * 
 * Desktop integration:
 *   window.electron.invoke('recommendations.analyzeRepo', { repoPath })
 * 
 * CLI integration:
 *   Called automatically in `ghost extension init` wizard
 */
class RecommendationEngine extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = {
            persistenceDir: options.persistenceDir || path.join(require('os').homedir(), '.ghost', 'analytics'),
            ...options
        };

        this.repositoryProfile = null;
        this.extensionRegistry = new Map();
        this.recommendations = [];
        this.userPatterns = {
            commitPatterns: [],
            filePatterns: [],
            workflowPatterns: []
        };
        this.conversionRates = new Map();
        this._ensurePersistenceDir();
    }

    _ensurePersistenceDir() {
        if (!fs.existsSync(this.options.persistenceDir)) {
            fs.mkdirSync(this.options.persistenceDir, { recursive: true });
        }
    }

    async analyzeRepository(repoPath) {
        const profile = {
            path: repoPath,
            timestamp: Date.now(),
            languages: await this._detectLanguages(repoPath),
            frameworks: await this._detectFrameworks(repoPath),
            filePatterns: await this._analyzeFilePatterns(repoPath),
            gitComplexity: await this._analyzeGitComplexity(repoPath),
            commitPatterns: await this._analyzeCommitPatterns(repoPath),
            fileStructure: await this._analyzeFileStructure(repoPath),
            teamSize: await this._estimateTeamSize(repoPath),
            activityLevel: await this._calculateActivityLevel(repoPath),
            characteristics: await this._analyzeCharacteristics(repoPath)
        };

        this.repositoryProfile = profile;
        this.emit('repository-analyzed', profile);

        return profile;
    }

    async _analyzeCharacteristics(repoPath) {
        const characteristics = {
            hasPackageJson: false,
            hasRequirementsTxt: false,
            hasGoMod: false,
            hasCICD: false,
            hasDocker: false,
            hasTests: false,
            projectType: 'unknown',
            buildSystem: 'none'
        };

        try {
            characteristics.hasPackageJson = fs.existsSync(path.join(repoPath, 'package.json'));
            characteristics.hasRequirementsTxt = fs.existsSync(path.join(repoPath, 'requirements.txt'));
            characteristics.hasGoMod = fs.existsSync(path.join(repoPath, 'go.mod'));
            characteristics.hasCICD = fs.existsSync(path.join(repoPath, '.github', 'workflows')) ||
                                      fs.existsSync(path.join(repoPath, '.gitlab-ci.yml')) ||
                                      fs.existsSync(path.join(repoPath, 'Jenkinsfile'));
            characteristics.hasDocker = fs.existsSync(path.join(repoPath, 'Dockerfile'));
            characteristics.hasTests = fs.existsSync(path.join(repoPath, 'test')) ||
                                       fs.existsSync(path.join(repoPath, 'tests')) ||
                                       fs.existsSync(path.join(repoPath, '__tests__'));

            if (characteristics.hasPackageJson) {
                characteristics.projectType = 'javascript';
                characteristics.buildSystem = 'npm';
            } else if (characteristics.hasRequirementsTxt) {
                characteristics.projectType = 'python';
                characteristics.buildSystem = 'pip';
            } else if (characteristics.hasGoMod) {
                characteristics.projectType = 'go';
                characteristics.buildSystem = 'go';
            }
        } catch (error) {
        }

        return characteristics;
    }

    async _analyzeFilePatterns(repoPath) {
        const patterns = {
            totalFiles: 0,
            fileTypes: {},
            largeFiles: 0,
            configFiles: 0
        };

        try {
            const gitLsFiles = execSync('git ls-files', {
                cwd: repoPath,
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore']
            }).trim();

            const files = gitLsFiles.split('\n').filter(f => f);
            patterns.totalFiles = files.length;

            for (const file of files) {
                const ext = path.extname(file);
                patterns.fileTypes[ext] = (patterns.fileTypes[ext] || 0) + 1;

                if (file.includes('config') || file.includes('.rc') || file.includes('.yml') || file.includes('.yaml')) {
                    patterns.configFiles++;
                }

                try {
                    const fullPath = path.join(repoPath, file);
                    if (fs.existsSync(fullPath)) {
                        const stat = fs.statSync(fullPath);
                        if (stat.size > 1024 * 1024) {
                            patterns.largeFiles++;
                        }
                    }
                } catch (e) {
                }
            }
        } catch (error) {
        }

        return patterns;
    }

    async _analyzeGitComplexity(repoPath) {
        const complexity = {
            totalCommits: 0,
            branches: 0,
            contributors: 0,
            ageInDays: 0
        };

        try {
            const commitCount = execSync('git log --oneline | wc -l', {
                cwd: repoPath,
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore']
            }).trim();
            complexity.totalCommits = parseInt(commitCount) || 0;

            const branchCount = execSync('git branch -a | wc -l', {
                cwd: repoPath,
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore']
            }).trim();
            complexity.branches = parseInt(branchCount) || 0;

            const contributorCount = execSync('git log --format="%ae" | sort -u | wc -l', {
                cwd: repoPath,
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore']
            }).trim();
            complexity.contributors = parseInt(contributorCount) || 0;

            const firstCommitTimestamp = execSync('git log --reverse --format="%at" | head -1', {
                cwd: repoPath,
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore']
            }).trim();
            
            if (firstCommitTimestamp) {
                const firstCommitTime = parseInt(firstCommitTimestamp) * 1000;
                complexity.ageInDays = Math.floor((Date.now() - firstCommitTime) / (1000 * 60 * 60 * 24));
            }
        } catch (error) {
        }

        return complexity;
    }

    registerExtension(extensionId, metadata) {
        this.extensionRegistry.set(extensionId, {
            extensionId,
            ...metadata,
            registeredAt: Date.now()
        });
    }

    async generateRecommendations(context = {}) {
        if (!this.repositoryProfile) {
            throw new Error('Repository must be analyzed first');
        }

        const recommendations = [];

        recommendations.push(...this._recommendByLanguage());
        recommendations.push(...this._recommendByFramework());
        recommendations.push(...this._recommendByCommitPatterns());
        recommendations.push(...this._recommendByFileStructure());
        recommendations.push(...this._recommendByTeamSize());
        recommendations.push(...this._recommendByActivity());
        recommendations.push(...this._recommendByUserBehavior(context.behaviorAnalytics));
        recommendations.push(...this._recommendByFilePatterns());
        recommendations.push(...this._recommendByGitComplexity());
        recommendations.push(...this._recommendByCharacteristics());

        const scored = recommendations.map(rec => ({
            ...rec,
            confidence: this._calculateConfidenceScore(rec),
            score: this._calculateRecommendationScore(rec)
        }));

        const filtered = this._deduplicateRecommendations(scored);
        const sorted = filtered.sort((a, b) => b.score - a.score);

        this.recommendations = sorted;
        this.emit('recommendations-generated', { count: sorted.length });

        return sorted;
    }

    getTopRecommendations(limit = 5) {
        return this.recommendations.slice(0, limit);
    }

    getRecommendationsByCategory(category) {
        return this.recommendations.filter(rec => rec.category === category);
    }

    recordUserFeedback(extensionId, feedback) {
        const extension = this.extensionRegistry.get(extensionId);
        if (!extension) {
            return;
        }

        if (!extension.feedback) {
            extension.feedback = [];
        }

        extension.feedback.push({
            timestamp: Date.now(),
            ...feedback
        });

        if (feedback.installed === true) {
            this._updateConversionRate(extensionId, true);
        } else if (feedback.dismissed === true) {
            this._updateConversionRate(extensionId, false);
        }

        this.emit('feedback-recorded', { extensionId, feedback });
    }

    _updateConversionRate(extensionId, converted) {
        const current = this.conversionRates.get(extensionId) || {
            recommendations: 0,
            conversions: 0,
            conversion_rate: 0
        };

        current.recommendations++;
        if (converted) {
            current.conversions++;
        }
        current.conversion_rate = current.conversions / current.recommendations;

        this.conversionRates.set(extensionId, current);
    }

    getConversionRate(extensionId) {
        const data = this.conversionRates.get(extensionId);
        return data ? data.conversion_rate : 0;
    }

    getAllConversionRates() {
        const rates = {};
        for (const [extensionId, data] of this.conversionRates.entries()) {
            rates[extensionId] = data;
        }
        return rates;
    }

    async persist() {
        const filepath = path.join(this.options.persistenceDir, 'recommendations.json');
        
        const data = {
            timestamp: Date.now(),
            repositoryProfile: this.repositoryProfile,
            extensionRegistry: Array.from(this.extensionRegistry.entries()),
            recommendations: this.recommendations,
            userPatterns: this.userPatterns,
            conversionRates: Array.from(this.conversionRates.entries())
        };

        try {
            fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
            this.emit('persisted', { filepath });
        } catch (error) {
            this.emit('persist-error', { error: error.message });
            console.error(`[RecommendationEngine] Failed to persist: ${error.message}`);
        }
    }

    async load() {
        const filepath = path.join(this.options.persistenceDir, 'recommendations.json');
        
        if (!fs.existsSync(filepath)) {
            return;
        }

        try {
            const content = fs.readFileSync(filepath, 'utf8');
            const data = JSON.parse(content);

            this.repositoryProfile = data.repositoryProfile;
            this.extensionRegistry = new Map(data.extensionRegistry);
            this.recommendations = data.recommendations || [];
            this.userPatterns = data.userPatterns || { commitPatterns: [], filePatterns: [], workflowPatterns: [] };
            this.conversionRates = new Map(data.conversionRates || []);

            this.emit('loaded', { filepath });
        } catch (error) {
            this.emit('load-error', { error: error.message });
            console.error(`[RecommendationEngine] Failed to load: ${error.message}`);
        }
    }

    async _detectLanguages(repoPath) {
        const languages = new Map();
        const extensions = {
            '.js': 'JavaScript',
            '.ts': 'TypeScript',
            '.jsx': 'JavaScript',
            '.tsx': 'TypeScript',
            '.py': 'Python',
            '.java': 'Java',
            '.go': 'Go',
            '.rs': 'Rust',
            '.rb': 'Ruby',
            '.php': 'PHP',
            '.c': 'C',
            '.cpp': 'C++',
            '.cs': 'C#',
            '.swift': 'Swift',
            '.kt': 'Kotlin'
        };

        const packageJsonPath = path.join(repoPath, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                const deps = { ...pkg.dependencies, ...pkg.devDependencies };
                
                if (deps['typescript'] || deps['@types/node']) {
                    languages.set('TypeScript', (languages.get('TypeScript') || 0) + 100);
                }
            } catch (error) {
            }
        }

        const requirementsPath = path.join(repoPath, 'requirements.txt');
        if (fs.existsSync(requirementsPath)) {
            languages.set('Python', (languages.get('Python') || 0) + 100);
        }

        const goModPath = path.join(repoPath, 'go.mod');
        if (fs.existsSync(goModPath)) {
            languages.set('Go', (languages.get('Go') || 0) + 100);
        }

        const countFiles = (dir) => {
            if (!fs.existsSync(dir)) return;
            
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                
                for (const entry of entries) {
                    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
                    
                    const fullPath = path.join(dir, entry.name);
                    
                    if (entry.isDirectory()) {
                        countFiles(fullPath);
                    } else if (entry.isFile()) {
                        const ext = path.extname(entry.name);
                        const lang = extensions[ext];
                        if (lang) {
                            languages.set(lang, (languages.get(lang) || 0) + 1);
                        }
                    }
                }
            } catch (error) {
            }
        };

        countFiles(repoPath);

        return Array.from(languages.entries())
            .map(([language, count]) => ({ language, count }))
            .sort((a, b) => b.count - a.count);
    }

    async _detectFrameworks(repoPath) {
        const frameworks = [];
        const packageJsonPath = path.join(repoPath, 'package.json');
        const requirementsPath = path.join(repoPath, 'requirements.txt');
        const gemfilePath = path.join(repoPath, 'Gemfile');
        const goModPath = path.join(repoPath, 'go.mod');

        if (fs.existsSync(packageJsonPath)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                const deps = { ...pkg.dependencies, ...pkg.devDependencies };
                
                if (deps['react']) frameworks.push('React');
                if (deps['vue']) frameworks.push('Vue');
                if (deps['angular']) frameworks.push('Angular');
                if (deps['express']) frameworks.push('Express');
                if (deps['next']) frameworks.push('Next.js');
                if (deps['nuxt']) frameworks.push('Nuxt.js');
                if (deps['electron']) frameworks.push('Electron');
                if (deps['nest']) frameworks.push('NestJS');
                if (deps['fastify']) frameworks.push('Fastify');
            } catch (error) {
            }
        }

        if (fs.existsSync(requirementsPath)) {
            try {
                const content = fs.readFileSync(requirementsPath, 'utf8');
                if (content.includes('django')) frameworks.push('Django');
                if (content.includes('flask')) frameworks.push('Flask');
                if (content.includes('fastapi')) frameworks.push('FastAPI');
                if (content.includes('tensorflow')) frameworks.push('TensorFlow');
                if (content.includes('pytorch')) frameworks.push('PyTorch');
            } catch (error) {
            }
        }

        if (fs.existsSync(gemfilePath)) {
            try {
                const content = fs.readFileSync(gemfilePath, 'utf8');
                if (content.includes('rails')) frameworks.push('Ruby on Rails');
                if (content.includes('sinatra')) frameworks.push('Sinatra');
            } catch (error) {
            }
        }

        if (fs.existsSync(goModPath)) {
            try {
                const content = fs.readFileSync(goModPath, 'utf8');
                if (content.includes('gin-gonic/gin')) frameworks.push('Gin');
                if (content.includes('gorilla/mux')) frameworks.push('Gorilla');
                if (content.includes('echo')) frameworks.push('Echo');
            } catch (error) {
            }
        }

        return frameworks;
    }

    async _analyzeCommitPatterns(repoPath) {
        const patterns = {
            totalCommits: 0,
            commitsByType: {},
            commitsByHour: new Array(24).fill(0),
            avgCommitsPerDay: 0
        };

        try {
            const gitLog = execSync(
                'git log --format="%s|%ad" --date=format:"%H" -n 1000',
                { cwd: repoPath, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
            );

            const commits = gitLog.trim().split('\n').filter(line => line);
            patterns.totalCommits = commits.length;

            for (const commit of commits) {
                const [message, hour] = commit.split('|');
                
                const type = this._extractCommitType(message);
                patterns.commitsByType[type] = (patterns.commitsByType[type] || 0) + 1;

                if (hour) {
                    const hourNum = parseInt(hour);
                    if (!isNaN(hourNum)) {
                        patterns.commitsByHour[hourNum]++;
                    }
                }
            }

            const daysActive = await this._getDaysActive(repoPath);
            patterns.avgCommitsPerDay = daysActive > 0 ? patterns.totalCommits / daysActive : 0;
        } catch (error) {
        }

        return patterns;
    }

    async _analyzeFileStructure(repoPath) {
        const structure = {
            totalFiles: 0,
            totalDirectories: 0,
            depth: 0,
            hasTests: false,
            hasDocs: false,
            hasCI: false
        };

        const analyze = (dir, currentDepth = 0) => {
            if (!fs.existsSync(dir)) return;
            
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                
                for (const entry of entries) {
                    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
                    
                    if (entry.isDirectory()) {
                        structure.totalDirectories++;
                        
                        if (entry.name === 'test' || entry.name === 'tests' || entry.name === '__tests__') {
                            structure.hasTests = true;
                        }
                        if (entry.name === 'docs' || entry.name === 'documentation') {
                            structure.hasDocs = true;
                        }
                        if (entry.name === '.github' || entry.name === '.gitlab') {
                            structure.hasCI = true;
                        }
                        
                        const fullPath = path.join(dir, entry.name);
                        structure.depth = Math.max(structure.depth, currentDepth + 1);
                        analyze(fullPath, currentDepth + 1);
                    } else if (entry.isFile()) {
                        structure.totalFiles++;
                    }
                }
            } catch (error) {
            }
        };

        analyze(repoPath);
        return structure;
    }

    async _estimateTeamSize(repoPath) {
        try {
            const contributors = execSync(
                'git log --format="%ae" | sort -u | wc -l',
                { cwd: repoPath, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
            );
            return parseInt(contributors.trim()) || 1;
        } catch (error) {
            return 1;
        }
    }

    async _calculateActivityLevel(repoPath) {
        try {
            const lastMonth = execSync(
                'git log --since="1 month ago" --format="%H" | wc -l',
                { cwd: repoPath, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
            );
            const commits = parseInt(lastMonth.trim()) || 0;

            if (commits > 100) return 'high';
            if (commits > 20) return 'medium';
            if (commits > 0) return 'low';
            return 'inactive';
        } catch (error) {
            return 'unknown';
        }
    }

    async _getDaysActive(repoPath) {
        try {
            const firstCommit = execSync(
                'git log --reverse --format="%at" | head -1',
                { cwd: repoPath, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
            );
            const timestamp = parseInt(firstCommit.trim());
            if (isNaN(timestamp)) return 0;

            const daysSinceFirst = (Date.now() / 1000 - timestamp) / 86400;
            return Math.ceil(daysSinceFirst);
        } catch (error) {
            return 0;
        }
    }

    _extractCommitType(message) {
        const lowerMessage = message.toLowerCase();
        
        if (lowerMessage.startsWith('fix:') || lowerMessage.includes('fix ')) return 'fix';
        if (lowerMessage.startsWith('feat:') || lowerMessage.includes('feature')) return 'feature';
        if (lowerMessage.startsWith('docs:') || lowerMessage.includes('documentation')) return 'docs';
        if (lowerMessage.startsWith('test:') || lowerMessage.includes('test')) return 'test';
        if (lowerMessage.startsWith('refactor:') || lowerMessage.includes('refactor')) return 'refactor';
        if (lowerMessage.startsWith('chore:')) return 'chore';
        
        return 'other';
    }

    _recommendByLanguage() {
        const recommendations = [];
        const languages = this.repositoryProfile.languages;

        for (const { language, count } of languages) {
            switch (language) {
                case 'JavaScript':
                case 'TypeScript':
                    recommendations.push({
                        extensionId: 'eslint-integration',
                        reason: `High ${language} usage detected (${count} files)`,
                        category: 'code-quality',
                        confidence: 0.9,
                        matchScore: Math.min(count / 100, 1.0)
                    });
                    recommendations.push({
                        extensionId: 'prettier-formatter',
                        reason: `${language} code formatting`,
                        category: 'code-quality',
                        confidence: 0.85,
                        matchScore: Math.min(count / 100, 1.0)
                    });
                    break;
                case 'Python':
                    recommendations.push({
                        extensionId: 'black-formatter',
                        reason: `Python code formatting (${count} files)`,
                        category: 'code-quality',
                        confidence: 0.9,
                        matchScore: Math.min(count / 100, 1.0)
                    });
                    recommendations.push({
                        extensionId: 'pylint-checker',
                        reason: 'Python code analysis',
                        category: 'code-quality',
                        confidence: 0.85,
                        matchScore: Math.min(count / 100, 1.0)
                    });
                    break;
                case 'Go':
                    recommendations.push({
                        extensionId: 'gofmt-formatter',
                        reason: `Go code formatting (${count} files)`,
                        category: 'code-quality',
                        confidence: 0.95,
                        matchScore: Math.min(count / 50, 1.0)
                    });
                    break;
            }
        }

        return recommendations;
    }

    _recommendByFramework() {
        const recommendations = [];
        const frameworks = this.repositoryProfile.frameworks;

        for (const framework of frameworks) {
            switch (framework) {
                case 'React':
                    recommendations.push({
                        extensionId: 'react-hooks-linter',
                        reason: 'React hooks best practices',
                        category: 'framework',
                        confidence: 0.9,
                        matchScore: 1.0
                    });
                    break;
                case 'Express':
                case 'Fastify':
                case 'NestJS':
                    recommendations.push({
                        extensionId: 'api-documentation-generator',
                        reason: `${framework} API documentation`,
                        category: 'documentation',
                        confidence: 0.8,
                        matchScore: 1.0
                    });
                    break;
                case 'Django':
                case 'Flask':
                case 'FastAPI':
                    recommendations.push({
                        extensionId: 'python-api-docs',
                        reason: `${framework} API documentation`,
                        category: 'documentation',
                        confidence: 0.8,
                        matchScore: 1.0
                    });
                    break;
            }
        }

        return recommendations;
    }

    _recommendByCommitPatterns() {
        const recommendations = [];
        const patterns = this.repositoryProfile.commitPatterns;

        if (patterns.commitsByType.fix && patterns.commitsByType.fix > patterns.totalCommits * 0.3) {
            recommendations.push({
                extensionId: 'automated-testing',
                reason: `High number of bug fixes detected (${Math.round(patterns.commitsByType.fix / patterns.totalCommits * 100)}%)`,
                category: 'quality',
                confidence: 0.85,
                matchScore: patterns.commitsByType.fix / patterns.totalCommits
            });
        }

        if (!patterns.commitsByType.test || patterns.commitsByType.test < patterns.totalCommits * 0.05) {
            recommendations.push({
                extensionId: 'test-coverage-reporter',
                reason: 'Low test commit frequency',
                category: 'testing',
                confidence: 0.8,
                matchScore: 1.0 - (patterns.commitsByType.test || 0) / patterns.totalCommits
            });
        }

        return recommendations;
    }

    _recommendByFileStructure() {
        const recommendations = [];
        const structure = this.repositoryProfile.fileStructure;

        if (!structure.hasTests) {
            recommendations.push({
                extensionId: 'test-scaffolder',
                reason: 'No test directory found',
                category: 'testing',
                confidence: 0.9,
                matchScore: 1.0
            });
        }

        if (!structure.hasDocs) {
            recommendations.push({
                extensionId: 'doc-generator',
                reason: 'No documentation directory found',
                category: 'documentation',
                confidence: 0.85,
                matchScore: 1.0
            });
        }

        if (!structure.hasCI) {
            recommendations.push({
                extensionId: 'ci-cd-setup',
                reason: 'No CI/CD configuration detected',
                category: 'automation',
                confidence: 0.8,
                matchScore: 1.0
            });
        }

        return recommendations;
    }

    _recommendByTeamSize() {
        const recommendations = [];
        const teamSize = this.repositoryProfile.teamSize;

        if (teamSize >= 5) {
            recommendations.push({
                extensionId: 'code-review-automation',
                reason: `Large team detected (${teamSize} contributors)`,
                category: 'collaboration',
                confidence: 0.85,
                matchScore: Math.min(teamSize / 10, 1.0)
            });
            recommendations.push({
                extensionId: 'pr-template-enforcer',
                reason: 'Multiple contributors',
                category: 'collaboration',
                confidence: 0.8,
                matchScore: Math.min(teamSize / 10, 1.0)
            });
        }

        return recommendations;
    }

    _recommendByActivity() {
        const recommendations = [];
        const activity = this.repositoryProfile.activityLevel;

        if (activity === 'high') {
            recommendations.push({
                extensionId: 'commit-message-validator',
                reason: 'High commit frequency',
                category: 'workflow',
                confidence: 0.85,
                matchScore: 1.0
            });
            recommendations.push({
                extensionId: 'changelog-generator',
                reason: 'Active development',
                category: 'documentation',
                confidence: 0.8,
                matchScore: 1.0
            });
        }

        return recommendations;
    }

    _recommendByUserBehavior(behaviorAnalytics) {
        const recommendations = [];

        if (!behaviorAnalytics) {
            return recommendations;
        }

        const mostUsed = behaviorAnalytics.getMostUsedCommands(5);
        
        for (const cmd of mostUsed) {
            if (cmd.command.includes('commit') && cmd.count > 50) {
                recommendations.push({
                    extensionId: 'smart-commit-assistant',
                    reason: `Frequent commit operations (${cmd.count} times)`,
                    category: 'productivity',
                    confidence: 0.8,
                    matchScore: Math.min(cmd.count / 100, 1.0)
                });
            }
            
            if (cmd.command.includes('merge') && cmd.count > 20) {
                recommendations.push({
                    extensionId: 'merge-conflict-resolver',
                    reason: `Frequent merge operations (${cmd.count} times)`,
                    category: 'workflow',
                    confidence: 0.85,
                    matchScore: Math.min(cmd.count / 50, 1.0)
                });
            }
        }

        return recommendations;
    }

    _recommendByFilePatterns() {
        const recommendations = [];
        const patterns = this.repositoryProfile.filePatterns;

        if (patterns.largeFiles > 5) {
            recommendations.push({
                extensionId: 'large-file-optimizer',
                reason: `${patterns.largeFiles} large files detected`,
                category: 'optimization',
                confidence: 0.75,
                matchScore: Math.min(patterns.largeFiles / 20, 1.0)
            });
        }

        if (patterns.configFiles > 10) {
            recommendations.push({
                extensionId: 'config-validator',
                reason: `Multiple configuration files (${patterns.configFiles})`,
                category: 'quality',
                confidence: 0.7,
                matchScore: Math.min(patterns.configFiles / 30, 1.0)
            });
        }

        return recommendations;
    }

    _recommendByGitComplexity() {
        const recommendations = [];
        const complexity = this.repositoryProfile.gitComplexity;

        if (complexity.totalCommits > 1000) {
            recommendations.push({
                extensionId: 'git-history-analyzer',
                reason: `Large commit history (${complexity.totalCommits} commits)`,
                category: 'analytics',
                confidence: 0.75,
                matchScore: Math.min(complexity.totalCommits / 5000, 1.0)
            });
        }

        if (complexity.branches > 10) {
            recommendations.push({
                extensionId: 'branch-management',
                reason: `Multiple branches (${complexity.branches})`,
                category: 'workflow',
                confidence: 0.7,
                matchScore: Math.min(complexity.branches / 50, 1.0)
            });
        }

        return recommendations;
    }

    _recommendByCharacteristics() {
        const recommendations = [];
        const chars = this.repositoryProfile.characteristics;

        if (chars.hasDocker) {
            recommendations.push({
                extensionId: 'docker-integration',
                reason: 'Docker configuration detected',
                category: 'devops',
                confidence: 0.85,
                matchScore: 1.0
            });
        }

        if (chars.hasCICD) {
            recommendations.push({
                extensionId: 'ci-integration',
                reason: 'CI/CD pipeline detected',
                category: 'automation',
                confidence: 0.8,
                matchScore: 1.0
            });
        }

        return recommendations;
    }

    _calculateConfidenceScore(recommendation) {
        let confidence = recommendation.confidence || 0.5;
        
        const matchScore = recommendation.matchScore || 0.5;
        confidence = confidence * 0.7 + matchScore * 0.3;

        const conversionRate = this.getConversionRate(recommendation.extensionId);
        if (conversionRate > 0) {
            confidence = confidence * 0.8 + conversionRate * 0.2;
        }

        return Math.min(Math.max(confidence, 0), 1);
    }

    _calculateRecommendationScore(recommendation) {
        let score = this._calculateConfidenceScore(recommendation) * 100;

        const extension = this.extensionRegistry.get(recommendation.extensionId);
        if (extension && extension.feedback) {
            const avgRating = extension.feedback.reduce((sum, f) => sum + (f.rating || 0), 0) / extension.feedback.length;
            score *= (avgRating / 5);
        }

        return Math.round(score * 100) / 100;
    }

    _deduplicateRecommendations(recommendations) {
        const seen = new Set();
        const deduplicated = [];

        for (const rec of recommendations) {
            if (!seen.has(rec.extensionId)) {
                seen.add(rec.extensionId);
                deduplicated.push(rec);
            }
        }

        return deduplicated;
    }

    static async getTopRecommendations(repoPath, limit = 5) {
        const engine = new RecommendationEngine();
        await engine.load();
        
        const profile = await engine.analyzeRepository(repoPath);
        const recommendations = await engine.generateRecommendations();
        
        return engine.getTopRecommendations(limit);
    }
}

module.exports = RecommendationEngine;

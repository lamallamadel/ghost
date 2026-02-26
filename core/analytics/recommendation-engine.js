const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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
    }

    async analyzeRepository(repoPath) {
        const profile = {
            path: repoPath,
            timestamp: Date.now(),
            languages: await this._detectLanguages(repoPath),
            frameworks: await this._detectFrameworks(repoPath),
            commitPatterns: await this._analyzeCommitPatterns(repoPath),
            fileStructure: await this._analyzeFileStructure(repoPath),
            teamSize: await this._estimateTeamSize(repoPath),
            activityLevel: await this._calculateActivityLevel(repoPath)
        };

        this.repositoryProfile = profile;
        this.emit('repository-analyzed', profile);

        return profile;
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

        const scored = recommendations.map(rec => ({
            ...rec,
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

        this.emit('feedback-recorded', { extensionId, feedback });
    }

    async persist() {
        const filepath = path.join(this.options.persistenceDir, 'recommendations.json');
        
        const data = {
            timestamp: Date.now(),
            repositoryProfile: this.repositoryProfile,
            extensionRegistry: Array.from(this.extensionRegistry.entries()),
            recommendations: this.recommendations,
            userPatterns: this.userPatterns
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
            } catch (error) {
            }
        }

        if (fs.existsSync(requirementsPath)) {
            try {
                const content = fs.readFileSync(requirementsPath, 'utf8');
                if (content.includes('django')) frameworks.push('Django');
                if (content.includes('flask')) frameworks.push('Flask');
                if (content.includes('fastapi')) frameworks.push('FastAPI');
            } catch (error) {
            }
        }

        if (fs.existsSync(gemfilePath)) {
            try {
                const content = fs.readFileSync(gemfilePath, 'utf8');
                if (content.includes('rails')) frameworks.push('Ruby on Rails');
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
                        reason: `High ${language} usage detected`,
                        category: 'code-quality',
                        confidence: 0.9
                    });
                    recommendations.push({
                        extensionId: 'prettier-formatter',
                        reason: `${language} code formatting`,
                        category: 'code-quality',
                        confidence: 0.85
                    });
                    break;
                case 'Python':
                    recommendations.push({
                        extensionId: 'black-formatter',
                        reason: 'Python code formatting',
                        category: 'code-quality',
                        confidence: 0.9
                    });
                    recommendations.push({
                        extensionId: 'pylint-checker',
                        reason: 'Python code analysis',
                        category: 'code-quality',
                        confidence: 0.85
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
                        confidence: 0.9
                    });
                    break;
                case 'Express':
                    recommendations.push({
                        extensionId: 'api-documentation-generator',
                        reason: 'Express API documentation',
                        category: 'documentation',
                        confidence: 0.8
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
                reason: 'High number of bug fixes detected',
                category: 'quality',
                confidence: 0.85
            });
        }

        if (!patterns.commitsByType.test || patterns.commitsByType.test < patterns.totalCommits * 0.05) {
            recommendations.push({
                extensionId: 'test-coverage-reporter',
                reason: 'Low test commit frequency',
                category: 'testing',
                confidence: 0.8
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
                confidence: 0.9
            });
        }

        if (!structure.hasDocs) {
            recommendations.push({
                extensionId: 'doc-generator',
                reason: 'No documentation directory found',
                category: 'documentation',
                confidence: 0.85
            });
        }

        if (!structure.hasCI) {
            recommendations.push({
                extensionId: 'ci-cd-setup',
                reason: 'No CI/CD configuration detected',
                category: 'automation',
                confidence: 0.8
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
                reason: 'Large team detected',
                category: 'collaboration',
                confidence: 0.85
            });
            recommendations.push({
                extensionId: 'pr-template-enforcer',
                reason: 'Multiple contributors',
                category: 'collaboration',
                confidence: 0.8
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
                confidence: 0.85
            });
            recommendations.push({
                extensionId: 'changelog-generator',
                reason: 'Active development',
                category: 'documentation',
                confidence: 0.8
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
                    reason: 'Frequent commit operations',
                    category: 'productivity',
                    confidence: 0.8
                });
            }
            
            if (cmd.command.includes('merge') && cmd.count > 20) {
                recommendations.push({
                    extensionId: 'merge-conflict-resolver',
                    reason: 'Frequent merge operations',
                    category: 'workflow',
                    confidence: 0.85
                });
            }
        }

        return recommendations;
    }

    _calculateRecommendationScore(recommendation) {
        let score = recommendation.confidence * 100;

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
}

module.exports = RecommendationEngine;

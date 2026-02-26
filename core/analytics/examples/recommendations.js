const { RecommendationEngine } = require('../index');
const path = require('path');

async function recommendationExample() {
    const recommendations = new RecommendationEngine();

    console.log('=== Analyzing Repository ===\n');

    const repoPath = process.cwd();
    
    try {
        const profile = await recommendations.analyzeRepository(repoPath);
        console.log('Repository Profile:');
        console.log(JSON.stringify(profile, null, 2));

        console.log('\n=== Registering Extensions ===\n');
        
        recommendations.registerExtension('eslint-integration', {
            name: 'ESLint Integration',
            category: 'code-quality',
            description: 'Integrates ESLint for JavaScript/TypeScript linting'
        });

        recommendations.registerExtension('prettier-formatter', {
            name: 'Prettier Formatter',
            category: 'code-quality',
            description: 'Code formatter for consistent style'
        });

        recommendations.registerExtension('test-scaffolder', {
            name: 'Test Scaffolder',
            category: 'testing',
            description: 'Generates test files and boilerplate'
        });

        recommendations.registerExtension('doc-generator', {
            name: 'Documentation Generator',
            category: 'documentation',
            description: 'Generates API documentation from code'
        });

        recommendations.registerExtension('ci-cd-setup', {
            name: 'CI/CD Setup',
            category: 'automation',
            description: 'Sets up continuous integration pipelines'
        });

        console.log('\n=== Generating Recommendations ===\n');
        
        const recs = await recommendations.generateRecommendations();
        console.log('All Recommendations:');
        console.log(JSON.stringify(recs, null, 2));

        console.log('\n=== Top Recommendations ===\n');
        const topRecs = recommendations.getTopRecommendations(5);
        topRecs.forEach((rec, index) => {
            console.log(`${index + 1}. ${rec.extensionId}`);
            console.log(`   Reason: ${rec.reason}`);
            console.log(`   Category: ${rec.category}`);
            console.log(`   Score: ${rec.score}`);
            console.log('');
        });

        console.log('=== Recommendations by Category ===\n');
        const categories = ['code-quality', 'testing', 'documentation', 'automation'];
        
        for (const category of categories) {
            const categoryRecs = recommendations.getRecommendationsByCategory(category);
            if (categoryRecs.length > 0) {
                console.log(`${category}:`);
                categoryRecs.forEach(rec => {
                    console.log(`  - ${rec.extensionId} (score: ${rec.score})`);
                });
                console.log('');
            }
        }

        console.log('=== Recording User Feedback ===\n');
        
        recommendations.recordUserFeedback('eslint-integration', {
            rating: 5,
            comment: 'Very helpful for code quality'
        });

        recommendations.recordUserFeedback('prettier-formatter', {
            rating: 4,
            comment: 'Works well, but needs more configuration options'
        });

        await recommendations.persist();
        console.log('✓ Recommendations persisted');

    } catch (error) {
        console.error('Error analyzing repository:', error.message);
        console.log('\n=== Sample Recommendation Output ===\n');
        console.log('If this were a JavaScript/TypeScript repository, you would see:');
        console.log(JSON.stringify([
            {
                extensionId: 'eslint-integration',
                reason: 'High JavaScript usage detected',
                category: 'code-quality',
                confidence: 0.9,
                score: 90
            },
            {
                extensionId: 'prettier-formatter',
                reason: 'JavaScript code formatting',
                category: 'code-quality',
                confidence: 0.85,
                score: 85
            }
        ], null, 2));
    }
}

recommendationExample().catch(console.error);

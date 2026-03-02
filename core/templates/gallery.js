const fs = require('fs');
const path = require('path');

class TemplateGallery {
    constructor() {
        this.templates = new Map();
        this._loadTemplates();
    }

    _loadTemplates() {
        const ApiTemplate = require('./api-integration');
        const FileProcessorTemplate = require('./file-processor');
        const GitWorkflowTemplate = require('./git-workflow');
        const TestingTemplate = require('./testing');

        this.templates.set('api-integration', new ApiTemplate());
        this.templates.set('file-processor', new FileProcessorTemplate());
        this.templates.set('git-workflow', new GitWorkflowTemplate());
        this.templates.set('testing', new TestingTemplate());
    }

    listTemplates() {
        return Array.from(this.templates.values()).map(t => t.metadata);
    }

    getTemplate(id) {
        return this.templates.get(id);
    }

    async generateFromTemplate(templateId, data) {
        const template = this.templates.get(templateId);
        if (!template) {
            throw new Error(`Template not found: ${templateId}`);
        }

        const outputDir = path.join(process.cwd(), data.id);

        if (fs.existsSync(outputDir)) {
            throw new Error(`Directory ${outputDir} already exists`);
        }

        fs.mkdirSync(outputDir, { recursive: true });

        await template.generate(outputDir, data);

        return outputDir;
    }
}

module.exports = TemplateGallery;

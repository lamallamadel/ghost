const fs = require('fs');
const path = require('path');

class BaseTemplate {
    constructor(metadata) {
        this.metadata = metadata;
    }

    async generate(outputDir, data) {
        throw new Error('generate() must be implemented by template subclass');
    }

    writeFile(dir, filename, content) {
        fs.writeFileSync(path.join(dir, filename), content);
    }

    createDir(dir, subdir) {
        const fullPath = path.join(dir, subdir);
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
        }
        return fullPath;
    }

    _toPascalCase(str) {
        return str
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join('');
    }

    _generateGitignore() {
        return `node_modules/
dist/
*.log
.DS_Store
.env
.env.local
coverage/
.nyc_output/
`;
    }
}

module.exports = BaseTemplate;

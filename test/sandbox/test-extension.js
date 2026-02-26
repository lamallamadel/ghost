class TestExtension {
    constructor() {
        this.name = 'Sandbox Test Extension';
        this.callCount = 0;
    }

    async init(config) {
        console.log('Extension initialized with config:', config);
        return { initialized: true };
    }

    async testMethod(params) {
        this.callCount++;
        console.log('testMethod called with:', params);
        return {
            success: true,
            callCount: this.callCount,
            params: params
        };
    }

    async readFiles(params) {
        if (!fs || !fs.readFile) {
            throw new Error('Filesystem API not available');
        }

        const result = await fs.readFile(params.path);
        return result;
    }

    async makeNetworkRequest(params) {
        if (!http || !http.get) {
            throw new Error('Network API not available');
        }

        const result = await http.get(params.url);
        return result;
    }

    async gitStatus(params) {
        if (!git || !git.status) {
            throw new Error('Git API not available');
        }

        const result = await git.status();
        return result;
    }

    async cleanup() {
        console.log('Extension cleanup called');
        return { cleaned: true };
    }
}

module.exports = TestExtension;

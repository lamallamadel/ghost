function generateBadge(type, value) {
    const badges = {
        downloads: (count) => {
            const formatted = count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count;
            return {
                label: 'downloads',
                message: formatted,
                color: 'blue'
            };
        },
        rating: (rating) => {
            const color = rating >= 4.5 ? 'brightgreen' : rating >= 3.5 ? 'green' : rating >= 2.5 ? 'yellow' : 'red';
            return {
                label: 'rating',
                message: `${rating}/5`,
                color
            };
        },
        security: (status) => {
            const statusMap = {
                passed: { message: 'passed', color: 'brightgreen' },
                warning: { message: 'warning', color: 'yellow' },
                failed: { message: 'failed', color: 'red' },
                pending: { message: 'pending', color: 'lightgrey' }
            };
            return {
                label: 'security',
                ...statusMap[status] || statusMap.pending
            };
        },
        version: (version) => {
            return {
                label: 'version',
                message: `v${version}`,
                color: 'blue'
            };
        }
    };

    if (!badges[type]) {
        throw new Error(`Unknown badge type: ${type}`);
    }

    return badges[type](value);
}

function badgeUrl(label, message, color) {
    return `https://img.shields.io/badge/${encodeURIComponent(label)}-${encodeURIComponent(message)}-${color}`;
}

function generateMarkdownBadges(extension) {
    const badges = [];

    badges.push(`![Version](${badgeUrl('version', `v${extension.latest_version}`, 'blue')})`);
    badges.push(`![Downloads](${badgeUrl('downloads', extension.downloads >= 1000 ? `${(extension.downloads / 1000).toFixed(1)}k` : extension.downloads, 'blue')})`);
    
    if (extension.ratings.count > 0) {
        const rating = extension.ratings.average;
        const color = rating >= 4.5 ? 'brightgreen' : rating >= 3.5 ? 'green' : 'yellow';
        badges.push(`![Rating](${badgeUrl('rating', `${rating}/5`, color)})`);
    }

    if (extension.verified) {
        badges.push(`![Verified](${badgeUrl('verified', '✓', 'brightgreen')})`);
    }

    return badges.join(' ');
}

module.exports = {
    generateBadge,
    badgeUrl,
    generateMarkdownBadges
};

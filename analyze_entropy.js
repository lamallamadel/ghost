const fs = require('fs');
const path = require('path');

// Outil de diagnostic local : liste les chaînes "soupçonnées" par entropie.
// Objectif : aider à comprendre pourquoi le scanner de Ghost signale des faux positifs.
// NB : Ce script ne bloque rien ; il imprime uniquement un rapport.

// Copied from ghost.js
function calculateShannonEntropy(data) {
    if (!data) return 0;
    const frequencies = {};
    for (let char of data) {
        frequencies[char] = (frequencies[char] || 0) + 1;
    }
    
    let entropy = 0;
    const len = data.length;
    for (let char in frequencies) {
        const p = frequencies[char] / len;
        entropy -= p * Math.log2(p);
    }
    return entropy;
}

function loadGhostIgnore() {
    const ghostIgnorePath = path.join(process.cwd(), '.ghostignore');
    if (!fs.existsSync(ghostIgnorePath)) return [];
    try {
        return fs.readFileSync(ghostIgnorePath, 'utf8')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
    } catch (e) {
        return [];
    }
}

const ignoredPatterns = loadGhostIgnore();
const isIgnored = (str) => ignoredPatterns.some(p => str.includes(p));
const isExampleFixture = (str) => /EXAMPLE/i.test(str);

const content = fs.readFileSync('ghost.js', 'utf8');
const lines = content.split('\n');
const regex = /(['"])(.*?)(\1)|=\s*([^\s]+)/g;

console.log("Line | Entropy | Content");
console.log("-----|---------|-----------------------------------");

lines.forEach((line, index) => {
    let match;
    // Reset regex state for each line
    const lineRegex = /(['"])(.*?)(\1)|=\s*([^\s]+)/g;
    
    while ((match = lineRegex.exec(line)) !== null) {
        const candidate = match[2] || match[4];
        if (!candidate || candidate.length < 12 || candidate.includes(' ')) continue;
        if (isIgnored(candidate) || isExampleFixture(candidate)) continue;
        
        const entropy = calculateShannonEntropy(candidate);
        // Seuil informatif : Ghost utilise 4.8 pour l'entropie dans le scanner.
        // Ici on affiche aussi les cas borderline pour investigation.
        if (entropy > 4.5) {
            console.log(`${index + 1}`.padEnd(5) + `| ${entropy.toFixed(2)}    | ${candidate.substring(0, 50)}...`);
        }
    }
});

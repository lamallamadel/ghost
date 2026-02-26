const { BehaviorAnalytics } = require('../index');

async function behaviorExample() {
    const behavior = new BehaviorAnalytics();

    console.log('=== Simulating User Commands ===\n');

    const commands = [
        ['git status', 'git-extension'],
        ['git add', 'git-extension'],
        ['git commit', 'git-extension'],
        ['git push', 'git-extension'],
        ['git status', 'git-extension'],
        ['format code', 'formatter-extension'],
        ['lint check', 'linter-extension'],
        ['git add', 'git-extension'],
        ['git commit', 'git-extension'],
        ['git status', 'git-extension']
    ];

    for (const [command, extension] of commands) {
        behavior.recordCommand(command, extension);
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('=== Most Used Commands ===\n');
    const topCommands = behavior.getMostUsedCommands(5);
    console.log(JSON.stringify(topCommands, null, 2));

    console.log('\n=== Most Used Extensions ===\n');
    const topExtensions = behavior.getMostUsedExtensions(5);
    console.log(JSON.stringify(topExtensions, null, 2));

    console.log('\n=== Command Sequences ===\n');
    const sequences = behavior.getCommandSequences('git add', 3);
    console.log(JSON.stringify(sequences, null, 2));

    console.log('\n=== Predicted Next Commands ===\n');
    const predictions = behavior.getPredictedNextCommands('git add', 3);
    console.log(JSON.stringify(predictions, null, 2));

    console.log('\n=== Session Analytics ===\n');
    const session = behavior.getSessionAnalytics();
    console.log(JSON.stringify(session, null, 2));

    await behavior.persist();
    console.log('\n✓ Behavior data persisted');
}

behaviorExample().catch(console.error);

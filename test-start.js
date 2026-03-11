const { GatewayLauncher } = require('./ghost.js');

async function test() {
    const launcher = new GatewayLauncher();
    await launcher.init();
    const parsedArgs = launcher.parseArgs([]);
    parsedArgs.flags.verbose = true;
    console.log("Routing...");
    await launcher.route(parsedArgs);
    console.log("Routed.");
}
test().catch(console.error);
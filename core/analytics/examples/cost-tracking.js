const { CostAttribution } = require('../index');

async function costExample() {
    const cost = new CostAttribution({
        billingRates: {
            cpu: 0.000001,
            memory: 0.0000001,
            io: 0.00001,
            network: 0.00001,
            storage: 0.0001
        }
    });

    console.log('=== Recording Resource Consumption ===\n');

    const extensions = [
        { id: 'image-processor', resources: { cpu: 5000, memory: 512, io: 10240, network: 0, storage: 100 } },
        { id: 'code-analyzer', resources: { cpu: 2000, memory: 256, io: 5120, network: 1024, storage: 50 } },
        { id: 'api-client', resources: { cpu: 500, memory: 64, io: 1024, network: 5120, storage: 10 } }
    ];

    for (let i = 0; i < 100; i++) {
        const ext = extensions[i % extensions.length];
        cost.recordResourceConsumption(ext.id, ext.resources);
    }

    console.log('=== Cost Report ===\n');
    const report = cost.getBillingReport();
    console.log(JSON.stringify(report, null, 2));

    console.log('\n=== Top Cost Extensions ===\n');
    const topCosts = cost.getTopCostExtensions(3);
    console.log(JSON.stringify(topCosts, null, 2));

    console.log('\n=== Cost Projection ===\n');
    const projection = cost.getCostProjection('image-processor', 30);
    console.log(JSON.stringify(projection, null, 2));

    console.log('\n=== Marketplace Billing (Per-Invocation) ===\n');
    const perInvocationBilling = cost.calculateMarketplaceBilling('image-processor', {
        type: 'per-invocation',
        pricePerInvocation: 0.001
    });
    console.log(JSON.stringify(perInvocationBilling, null, 2));

    console.log('\n=== Marketplace Billing (Tiered) ===\n');
    const tieredBilling = cost.calculateMarketplaceBilling('code-analyzer', {
        type: 'tiered',
        tiers: [
            { limit: 100, price: 0.002 },
            { limit: 500, price: 0.0015 },
            { limit: null, price: 0.001 }
        ]
    });
    console.log(JSON.stringify(tieredBilling, null, 2));

    console.log('\n=== Cost Alerts (Threshold: $0.50) ===\n');
    const alerts = cost.getCostAlert(0.50);
    console.log(JSON.stringify(alerts, null, 2));

    await cost.persist();
    console.log('\n✓ Cost data persisted');
}

costExample().catch(console.error);

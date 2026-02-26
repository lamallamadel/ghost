const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

class CostAttribution extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = {
            persistenceDir: options.persistenceDir || path.join(require('os').homedir(), '.ghost', 'analytics'),
            billingRates: options.billingRates || this._getDefaultBillingRates(),
            ...options
        };

        this.extensionCosts = new Map();
        this.billingPeriods = new Map();
        this.currentBillingPeriod = this._getCurrentBillingPeriod();
    }

    recordResourceConsumption(extensionId, resources) {
        const timestamp = Date.now();
        const costs = this._calculateCosts(resources);

        if (!this.extensionCosts.has(extensionId)) {
            this.extensionCosts.set(extensionId, {
                extensionId,
                totalCost: 0,
                resourceCosts: {
                    cpu: 0,
                    memory: 0,
                    io: 0,
                    network: 0,
                    storage: 0
                },
                invocations: 0,
                billingPeriods: []
            });
        }

        const extCosts = this.extensionCosts.get(extensionId);
        extCosts.totalCost += costs.total;
        extCosts.invocations++;

        for (const [resource, cost] of Object.entries(costs.breakdown)) {
            extCosts.resourceCosts[resource] = (extCosts.resourceCosts[resource] || 0) + cost;
        }

        this._updateBillingPeriod(extensionId, costs);
        this.emit('cost-recorded', {
            extensionId,
            costs,
            timestamp
        });
    }

    getCostsByExtension(extensionId) {
        const costs = this.extensionCosts.get(extensionId);
        if (!costs) {
            return null;
        }

        const currentPeriod = this._getBillingPeriodCosts(extensionId, this.currentBillingPeriod);

        return {
            ...costs,
            currentPeriod,
            averageCostPerInvocation: costs.invocations > 0
                ? costs.totalCost / costs.invocations
                : 0
        };
    }

    getAllCosts() {
        const allCosts = {};
        for (const [extensionId, costs] of this.extensionCosts) {
            allCosts[extensionId] = this.getCostsByExtension(extensionId);
        }
        return allCosts;
    }

    getBillingReport(billingPeriod = null) {
        const period = billingPeriod || this.currentBillingPeriod;
        const periodKey = this._getBillingPeriodKey(period);
        const periodCosts = this.billingPeriods.get(periodKey) || new Map();

        const report = {
            period,
            periodKey,
            timestamp: Date.now(),
            timestampISO: new Date().toISOString(),
            extensions: [],
            totalCost: 0,
            totalInvocations: 0,
            breakdown: {
                cpu: 0,
                memory: 0,
                io: 0,
                network: 0,
                storage: 0
            }
        };

        for (const [extensionId, costs] of periodCosts) {
            report.extensions.push({
                extensionId,
                ...costs
            });
            report.totalCost += costs.totalCost;
            report.totalInvocations += costs.invocations;

            for (const [resource, cost] of Object.entries(costs.resourceCosts)) {
                report.breakdown[resource] += cost;
            }
        }

        report.extensions.sort((a, b) => b.totalCost - a.totalCost);

        return report;
    }

    getTopCostExtensions(limit = 10, billingPeriod = null) {
        const report = this.getBillingReport(billingPeriod);
        return report.extensions.slice(0, limit);
    }

    getCostProjection(extensionId, days = 30) {
        const costs = this.extensionCosts.get(extensionId);
        if (!costs || costs.invocations === 0) {
            return null;
        }

        const avgCostPerInvocation = costs.totalCost / costs.invocations;
        const currentPeriod = this._getBillingPeriodCosts(extensionId, this.currentBillingPeriod);
        
        const periodDays = this._getBillingPeriodDays();
        const invocationsPerDay = currentPeriod.invocations / periodDays;
        
        const projectedInvocations = invocationsPerDay * days;
        const projectedCost = projectedInvocations * avgCostPerInvocation;

        return {
            extensionId,
            projectionDays: days,
            avgCostPerInvocation,
            invocationsPerDay,
            projectedInvocations: Math.ceil(projectedInvocations),
            projectedCost: Math.round(projectedCost * 100) / 100,
            confidence: this._calculateConfidence(currentPeriod.invocations)
        };
    }

    getCostAlert(threshold) {
        const alerts = [];
        const report = this.getBillingReport();

        for (const extCost of report.extensions) {
            if (extCost.totalCost > threshold) {
                alerts.push({
                    extensionId: extCost.extensionId,
                    cost: extCost.totalCost,
                    threshold,
                    exceeded: extCost.totalCost - threshold,
                    percentage: ((extCost.totalCost / threshold) * 100).toFixed(2)
                });
            }
        }

        return alerts;
    }

    calculateMarketplaceBilling(extensionId, pricingModel) {
        const costs = this.getCostsByExtension(extensionId);
        if (!costs) {
            return null;
        }

        let billing = {
            extensionId,
            pricingModel: pricingModel.type,
            baseCost: costs.totalCost,
            billingAmount: 0,
            margin: 0
        };

        switch (pricingModel.type) {
            case 'per-invocation':
                billing.billingAmount = costs.invocations * pricingModel.pricePerInvocation;
                billing.margin = billing.billingAmount - costs.totalCost;
                billing.invocations = costs.invocations;
                billing.pricePerInvocation = pricingModel.pricePerInvocation;
                break;

            case 'tiered':
                billing.billingAmount = this._calculateTieredBilling(costs.invocations, pricingModel.tiers);
                billing.margin = billing.billingAmount - costs.totalCost;
                billing.invocations = costs.invocations;
                billing.tiers = pricingModel.tiers;
                break;

            case 'subscription':
                billing.billingAmount = pricingModel.monthlyFee;
                billing.margin = billing.billingAmount - costs.currentPeriod.totalCost;
                billing.monthlyFee = pricingModel.monthlyFee;
                break;

            case 'usage-based':
                const resourceBilling = this._calculateUsageBasedBilling(
                    costs.resourceCosts,
                    pricingModel.resourcePrices
                );
                billing.billingAmount = resourceBilling.total;
                billing.margin = billing.billingAmount - costs.totalCost;
                billing.resourceBilling = resourceBilling.breakdown;
                break;

            default:
                billing.billingAmount = costs.totalCost * (1 + (pricingModel.markup || 0.5));
                billing.margin = billing.billingAmount - costs.totalCost;
        }

        billing.marginPercentage = costs.totalCost > 0
            ? ((billing.margin / costs.totalCost) * 100).toFixed(2)
            : 0;

        return billing;
    }

    async persist() {
        const filepath = path.join(this.options.persistenceDir, 'cost-attribution.json');
        
        const data = {
            timestamp: Date.now(),
            currentBillingPeriod: this.currentBillingPeriod,
            extensionCosts: Array.from(this.extensionCosts.entries()),
            billingPeriods: Array.from(this.billingPeriods.entries()).map(([key, value]) => [
                key,
                Array.from(value.entries())
            ])
        };

        try {
            fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
            this.emit('persisted', { filepath });
        } catch (error) {
            this.emit('persist-error', { error: error.message });
            console.error(`[CostAttribution] Failed to persist: ${error.message}`);
        }
    }

    async load() {
        const filepath = path.join(this.options.persistenceDir, 'cost-attribution.json');
        
        if (!fs.existsSync(filepath)) {
            return;
        }

        try {
            const content = fs.readFileSync(filepath, 'utf8');
            const data = JSON.parse(content);

            this.currentBillingPeriod = data.currentBillingPeriod || this._getCurrentBillingPeriod();
            this.extensionCosts = new Map(data.extensionCosts);
            this.billingPeriods = new Map(
                data.billingPeriods.map(([key, value]) => [key, new Map(value)])
            );

            this.emit('loaded', { filepath });
        } catch (error) {
            this.emit('load-error', { error: error.message });
            console.error(`[CostAttribution] Failed to load: ${error.message}`);
        }
    }

    _calculateCosts(resources) {
        const rates = this.options.billingRates;
        const breakdown = {};

        breakdown.cpu = (resources.cpu || 0) * rates.cpu;
        breakdown.memory = (resources.memory || 0) * rates.memory;
        breakdown.io = (resources.io || 0) * rates.io;
        breakdown.network = (resources.network || 0) * rates.network;
        breakdown.storage = (resources.storage || 0) * rates.storage;

        const total = Object.values(breakdown).reduce((sum, cost) => sum + cost, 0);

        return {
            total: Math.round(total * 1000000) / 1000000,
            breakdown
        };
    }

    _updateBillingPeriod(extensionId, costs) {
        const periodKey = this._getBillingPeriodKey(this.currentBillingPeriod);
        
        if (!this.billingPeriods.has(periodKey)) {
            this.billingPeriods.set(periodKey, new Map());
        }

        const periodCosts = this.billingPeriods.get(periodKey);
        
        if (!periodCosts.has(extensionId)) {
            periodCosts.set(extensionId, {
                extensionId,
                totalCost: 0,
                resourceCosts: {
                    cpu: 0,
                    memory: 0,
                    io: 0,
                    network: 0,
                    storage: 0
                },
                invocations: 0
            });
        }

        const extPeriodCosts = periodCosts.get(extensionId);
        extPeriodCosts.totalCost += costs.total;
        extPeriodCosts.invocations++;

        for (const [resource, cost] of Object.entries(costs.breakdown)) {
            extPeriodCosts.resourceCosts[resource] += cost;
        }
    }

    _getBillingPeriodCosts(extensionId, period) {
        const periodKey = this._getBillingPeriodKey(period);
        const periodCosts = this.billingPeriods.get(periodKey);
        
        if (!periodCosts) {
            return {
                totalCost: 0,
                invocations: 0,
                resourceCosts: {}
            };
        }

        return periodCosts.get(extensionId) || {
            totalCost: 0,
            invocations: 0,
            resourceCosts: {}
        };
    }

    _getCurrentBillingPeriod() {
        const now = new Date();
        return {
            year: now.getFullYear(),
            month: now.getMonth() + 1
        };
    }

    _getBillingPeriodKey(period) {
        return `${period.year}-${String(period.month).padStart(2, '0')}`;
    }

    _getBillingPeriodDays() {
        const now = new Date();
        return now.getDate();
    }

    _calculateTieredBilling(invocations, tiers) {
        let total = 0;
        let remaining = invocations;

        for (const tier of tiers) {
            if (remaining <= 0) break;

            const tierInvocations = tier.limit
                ? Math.min(remaining, tier.limit)
                : remaining;

            total += tierInvocations * tier.price;
            remaining -= tierInvocations;
        }

        return total;
    }

    _calculateUsageBasedBilling(resourceCosts, resourcePrices) {
        const breakdown = {};
        let total = 0;

        for (const [resource, cost] of Object.entries(resourceCosts)) {
            const price = resourcePrices[resource] || 0;
            const billing = cost * price;
            breakdown[resource] = billing;
            total += billing;
        }

        return { total, breakdown };
    }

    _calculateConfidence(sampleSize) {
        if (sampleSize >= 1000) return 'high';
        if (sampleSize >= 100) return 'medium';
        if (sampleSize >= 10) return 'low';
        return 'very-low';
    }

    _getDefaultBillingRates() {
        return {
            cpu: 0.000001,
            memory: 0.0000001,
            io: 0.00001,
            network: 0.00001,
            storage: 0.0001
        };
    }
}

module.exports = CostAttribution;

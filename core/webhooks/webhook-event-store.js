const fs = require('fs');
const path = require('path');
const os = require('os');

class WebhookEventStore {
    constructor(dbPath) {
        this.dbPath = dbPath || path.join(os.homedir(), '.ghost', 'webhooks', 'events.db');
        this._ensureDirectory();
        this._initializeDatabase();
    }
    
    _ensureDirectory() {
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }
    
    _initializeDatabase() {
        if (!fs.existsSync(this.dbPath)) {
            this._writeDatabase({ events: [], deliveries: [] });
        }
    }
    
    _readDatabase() {
        try {
            const content = fs.readFileSync(this.dbPath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.error('Error reading webhook database:', error);
            return { events: [], deliveries: [] };
        }
    }
    
    _writeDatabase(data) {
        try {
            fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2), 'utf8');
        } catch (error) {
            console.error('Error writing webhook database:', error);
        }
    }
    
    async saveEvent(event) {
        const db = this._readDatabase();
        
        const storedEvent = {
            ...event,
            storedAt: new Date().toISOString()
        };
        
        db.events.push(storedEvent);
        
        const maxEvents = 10000;
        if (db.events.length > maxEvents) {
            db.events = db.events.slice(-maxEvents);
        }
        
        this._writeDatabase(db);
        
        return storedEvent;
    }
    
    async getEvent(eventId) {
        const db = this._readDatabase();
        return db.events.find(e => e.id === eventId);
    }
    
    async queryEvents(filter = {}) {
        const db = this._readDatabase();
        let events = db.events;
        
        if (filter.provider) {
            events = events.filter(e => e.provider === filter.provider);
        }
        
        if (filter.eventType) {
            events = events.filter(e => e.eventType === filter.eventType);
        }
        
        if (filter.since) {
            const sinceDate = new Date(filter.since);
            events = events.filter(e => new Date(e.receivedAt) >= sinceDate);
        }
        
        if (filter.until) {
            const untilDate = new Date(filter.until);
            events = events.filter(e => new Date(e.receivedAt) <= untilDate);
        }
        
        if (filter.limit) {
            events = events.slice(-filter.limit);
        }
        
        return events;
    }
    
    async saveDelivery(delivery) {
        const db = this._readDatabase();
        
        const storedDelivery = {
            ...delivery,
            id: delivery.id || this._generateId(),
            createdAt: new Date().toISOString()
        };
        
        db.deliveries.push(storedDelivery);
        
        const maxDeliveries = 10000;
        if (db.deliveries.length > maxDeliveries) {
            db.deliveries = db.deliveries.slice(-maxDeliveries);
        }
        
        this._writeDatabase(db);
        
        return storedDelivery;
    }
    
    async updateDelivery(deliveryId, updates) {
        const db = this._readDatabase();
        
        const deliveryIndex = db.deliveries.findIndex(d => d.id === deliveryId);
        
        if (deliveryIndex === -1) {
            throw new Error(`Delivery not found: ${deliveryId}`);
        }
        
        db.deliveries[deliveryIndex] = {
            ...db.deliveries[deliveryIndex],
            ...updates,
            updatedAt: new Date().toISOString()
        };
        
        this._writeDatabase(db);
        
        return db.deliveries[deliveryIndex];
    }
    
    async getDelivery(deliveryId) {
        const db = this._readDatabase();
        return db.deliveries.find(d => d.id === deliveryId);
    }
    
    async queryDeliveries(filter = {}) {
        const db = this._readDatabase();
        let deliveries = db.deliveries;
        
        if (filter.webhookEventId) {
            deliveries = deliveries.filter(d => d.webhookEventId === filter.webhookEventId);
        }
        
        if (filter.extensionId) {
            deliveries = deliveries.filter(d => d.extensionId === filter.extensionId);
        }
        
        if (filter.status) {
            deliveries = deliveries.filter(d => d.status === filter.status);
        }
        
        if (filter.limit) {
            deliveries = deliveries.slice(-filter.limit);
        }
        
        return deliveries;
    }
    
    async replayEvent(eventId) {
        const event = await this.getEvent(eventId);
        
        if (!event) {
            throw new Error(`Event not found: ${eventId}`);
        }
        
        return event;
    }
    
    async pruneOldEvents(olderThanDays = 30) {
        const db = this._readDatabase();
        
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
        
        const eventsBeforeCount = db.events.length;
        const deliveriesBeforeCount = db.deliveries.length;
        
        db.events = db.events.filter(e => new Date(e.receivedAt) >= cutoffDate);
        db.deliveries = db.deliveries.filter(d => new Date(d.createdAt) >= cutoffDate);
        
        this._writeDatabase(db);
        
        return {
            eventsRemoved: eventsBeforeCount - db.events.length,
            deliveriesRemoved: deliveriesBeforeCount - db.deliveries.length
        };
    }
    
    _generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}

module.exports = { WebhookEventStore };

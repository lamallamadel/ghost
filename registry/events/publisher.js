'use strict';

/**
 * NATS event publisher for the ghost-registry service.
 *
 * Activated when NATS_URL env var is set.
 * All publish calls are fire-and-forget — errors are logged but never thrown.
 *
 * Subjects published:
 *   ghost.registry.extension.published
 *   ghost.registry.extension.approved
 *   ghost.registry.download.tracked
 */
class RegistryPublisher {
    constructor() {
        this._nc = null;
        this._sc = null;
        this._connecting = false;
    }

    async connect() {
        if (!process.env.NATS_URL) {
            console.log('[Registry/NATS] NATS_URL not set — event publishing disabled');
            return;
        }

        this._connecting = true;
        try {
            const { connect, StringCodec } = require('nats');
            this._nc = await connect({ servers: process.env.NATS_URL });
            this._sc = StringCodec();
            console.log(`[Registry/NATS] Connected to ${process.env.NATS_URL}`);
        } catch (err) {
            console.warn('[Registry/NATS] Failed to connect — event publishing disabled:', err.message);
            this._nc = null;
        } finally {
            this._connecting = false;
        }
    }

    /**
     * Fire-and-forget publish.
     * @param {string} subject  NATS subject
     * @param {object} payload  JSON-serializable payload
     */
    publish(subject, payload) {
        if (!this._nc) return;
        try {
            const data = this._sc.encode(JSON.stringify({ ...payload, _ts: Date.now() }));
            this._nc.publish(subject, data);
        } catch (err) {
            console.warn(`[Registry/NATS] publish error on ${subject}:`, err.message);
        }
    }

    async close() {
        if (this._nc) {
            await this._nc.drain();
        }
    }
}

const publisher = new RegistryPublisher();
module.exports = publisher;

'use strict';

/**
 * Keycloak OIDC adapter for the Ghost marketplace.
 *
 * Env vars (all required when KEYCLOAK_URL is set):
 *   KEYCLOAK_URL   - e.g. http://auth.platform-shared.svc.cluster.local:8080
 *   KEYCLOAK_REALM - e.g. ghost
 *
 * Uses Resource Owner Password Credentials (ROPC) for CLI login.
 * JWKS keys are cached in memory and refreshed every 15 minutes.
 */
class KeycloakAdapter {
    constructor() {
        this._url = process.env.KEYCLOAK_URL;
        this._realm = process.env.KEYCLOAK_REALM || 'ghost';
        this._tokenUrl = `${this._url}/realms/${this._realm}/protocol/openid-connect/token`;
        this._certsUrl = `${this._url}/realms/${this._realm}/protocol/openid-connect/certs`;

        this._jwks = null;
        this._jwksLastFetched = 0;
        this._jwksCacheTtl = 15 * 60 * 1000; // 15 minutes
    }

    /**
     * ROPC login: exchange username/password for Keycloak access token.
     * @returns {{ success: boolean, token?: string, user?: object, error?: string }}
     */
    async loginWithKeycloak(username, password) {
        const body = new URLSearchParams({
            grant_type: 'password',
            client_id: 'ghost-cli',
            username,
            password
        });

        let resp;
        try {
            resp = await fetch(this._tokenUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString()
            });
        } catch (err) {
            return { success: false, error: `Keycloak unreachable: ${err.message}` };
        }

        if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            return { success: false, error: `Keycloak login failed (${resp.status}): ${text}` };
        }

        const tokens = await resp.json();
        const payload = this._decodePayload(tokens.access_token);

        return {
            success: true,
            token: tokens.access_token,
            user: {
                id: payload.sub,
                username: payload.preferred_username || username,
                email: payload.email || '',
                isAdmin: this._isAdmin(payload)
            }
        };
    }

    /**
     * Verify a Keycloak JWT using JWKS.
     * Returns the decoded payload shaped as { userId, isAdmin } on success, or null on failure.
     */
    async verifyKeycloakToken(token) {
        try {
            const { createRemoteJWKSet, jwtVerify } = require('jose');
            const jwks = await this._getJWKS(createRemoteJWKSet);
            const { payload } = await jwtVerify(token, jwks, {
                issuer: `${this._url}/realms/${this._realm}`,
                audience: 'ghost-cli'
            });
            return {
                userId: payload.sub,
                isAdmin: this._isAdmin(payload),
                username: payload.preferred_username || payload.sub
            };
        } catch {
            return null;
        }
    }

    async _getJWKS(createRemoteJWKSet) {
        const now = Date.now();
        if (!this._jwks || now - this._jwksLastFetched > this._jwksCacheTtl) {
            this._jwks = createRemoteJWKSet(new URL(this._certsUrl));
            this._jwksLastFetched = now;
        }
        return this._jwks;
    }

    _isAdmin(payload) {
        // Check Keycloak realm_access roles
        const roles = payload.realm_access?.roles || [];
        return roles.includes('ghost-admin') || roles.includes('admin');
    }

    _decodePayload(token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) return {};
            return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        } catch {
            return {};
        }
    }
}

module.exports = { KeycloakAdapter };

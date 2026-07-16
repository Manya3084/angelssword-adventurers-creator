/**
 * ⚔️ AS Adventurer — xAI / Grok SuperGrok OAuth Manager
 * Handles device-code OAuth flow against accounts.x.ai / auth.x.ai
 * so SuperGrok / X Premium+ users can use Grok Imagine for sprites & video
 * without a separate paid API key.
 */

(function() {
    'use strict';

    const STORAGE_KEY = 'xai_oauth_tokens';
    const POLL_INTERVAL_MS = 5000;

    // ============================================
    // TOKEN STORAGE
    // ============================================
    function loadTokens() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    function saveTokens(tokens) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_at: tokens.expires_at || (Date.now() + (tokens.expires_in || 3600) * 1000),
            obtained_at: Date.now()
        }));
    }

    function clearTokens() {
        localStorage.removeItem(STORAGE_KEY);
    }

    function isTokenExpiring(tokens, skewSec = 300) {
        if (!tokens || !tokens.expires_at) return true;
        return Date.now() >= (tokens.expires_at - skewSec * 1000);
    }

    // ============================================
    // DEVICE CODE FLOW
    // ============================================
    async function requestDeviceCode() {
        const resp = await fetch('/api/xai/oauth/device', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}'
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.error || `Device code request failed: ${resp.status}`);
        }
        return resp.json();
    }

    async function pollForToken(deviceCode, intervalSec = 5) {
        const body = {
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            device_code: deviceCode
        };

        while (true) {
            await new Promise(r => setTimeout(r, (intervalSec || 5) * 1000));

            const resp = await fetch('/api/xai/oauth/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const data = await resp.json().catch(() => ({}));

            if (resp.ok && data.access_token) {
                return data;
            }

            if (data.error === 'authorization_pending') {
                continue;
            }
            if (data.error === 'slow_down') {
                intervalSec = (intervalSec || 5) + 2;
                continue;
            }
            if (data.error === 'expired_token') {
                throw new Error('Device code expired. Please try logging in again.');
            }
            if (data.error === 'access_denied') {
                throw new Error('You denied the login request.');
            }
            throw new Error(data.error_description || data.error || `Token poll failed: ${resp.status}`);
        }
    }

    async function refreshAccessToken(refreshToken) {
        const resp = await fetch('/api/xai/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            })
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.error_description || err.error || `Refresh failed: ${resp.status}`);
        }
        return resp.json();
    }

    // ============================================
    // PUBLIC API
    // ============================================
    async function login(onProgress) {
        onProgress?.('Requesting device code from xAI...');
        const device = await requestDeviceCode();

        const uri = device.verification_uri_complete || device.verification_uri;
        const userCode = device.user_code;

        onProgress?.({
            type: 'device_code',
            url: uri,
            user_code: userCode,
            message: `Open ${uri} and enter code: ${userCode}`
        });

        // Optionally auto-open
        try { window.open(uri, '_blank'); } catch (_) {}

        onProgress?.('Waiting for you to approve in the browser...');
        const tokens = await pollForToken(device.device_code, device.interval);

        const expires_at = Date.now() + (tokens.expires_in || 3600) * 1000;
        saveTokens({ ...tokens, expires_at });
        onProgress?.('Login successful! SuperGrok session active.');
        return tokens;
    }

    async function getAccessToken() {
        let tokens = loadTokens();
        if (!tokens || !tokens.access_token) {
            return null;
        }

        if (isTokenExpiring(tokens) && tokens.refresh_token) {
            try {
                const refreshed = await refreshAccessToken(tokens.refresh_token);
                const expires_at = Date.now() + (refreshed.expires_in || 3600) * 1000;
                tokens = { ...tokens, ...refreshed, expires_at };
                saveTokens(tokens);
            } catch (e) {
                console.warn('[xAI OAuth] Refresh failed, clearing tokens:', e.message);
                clearTokens();
                return null;
            }
        }

        return tokens.access_token;
    }

    function logout() {
        clearTokens();
    }

    function isLoggedIn() {
        const t = loadTokens();
        return !!(t && t.access_token);
    }

    function getStatus() {
        const t = loadTokens();
        if (!t) return { loggedIn: false };
        return {
            loggedIn: true,
            expiresAt: t.expires_at,
            obtainedAt: t.obtained_at,
            hasRefresh: !!t.refresh_token
        };
    }

    // Expose globally
    window.XaiOAuth = {
        login,
        logout,
        getAccessToken,
        isLoggedIn,
        getStatus,
        loadTokens
    };

    console.log('[xAI OAuth] Manager ready');
})();

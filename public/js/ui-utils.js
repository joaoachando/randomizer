let userName = localStorage.getItem('userName') || '';
let userPassword = localStorage.getItem('userPassword') || '';
localStorage.removeItem('sessionToken');
localStorage.removeItem('p3_bio_vault');

function authHeaders() {
    return {
        'x-user-name': userName,
        'x-user-password': userPassword
    };
}

function triggerHaptic(pattern = 10) {
    if (navigator.vibrate) {
        try { navigator.vibrate(pattern); } catch (e) {}
    }
}

function triggerConfetti() {
    triggerHaptic([20, 40, 30]);
    if (typeof confetti === 'function') {
        confetti({ particleCount: 70, spread: 65, origin: { y: 0.6 } });
    }
}

function showToast(msg, isError = false) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = isError ? 'toast error' : 'toast';
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
}

function renderLoadingSkeleton(list, count = 3) {
    if (!list) return;
    list.innerHTML = Array.from({ length: count }, () => `
        <li class="idea-item skeleton-list-item" aria-hidden="true">
            <span class="skeleton-shimmer" style="width:58%;height:16px;"></span>
            <span class="skeleton-shimmer" style="width:88%;height:11px;"></span>
            <span class="skeleton-shimmer" style="width:36%;height:10px;"></span>
        </li>
    `).join('');
}

function formatPartnerRatings(joaoRating, jennaRating, averageRating) {
    const joao = Number(joaoRating) || 0;
    const jenna = Number(jennaRating) || 0;
    const average = Number(averageRating) || 0;
    return `João: ${joao ? `${joao}❤️` : '—'} • Jenna: ${jenna ? `${jenna}❤️` : '—'} • Avg: ${average ? `${average}❤️` : '—'}`;
}

function askConfirm(message) {
    triggerHaptic(12);
    return new Promise((resolve) => {
        const overlay = document.getElementById('confirm-overlay');
        document.getElementById('confirm-message').innerText = message;
        overlay.style.display = 'flex';

        const yesBtn = document.getElementById('confirm-yes-btn');
        const noBtn = document.getElementById('confirm-no-btn');
        const cleanup = (val) => {
            overlay.style.display = 'none';
            yesBtn.onclick = null;
            noBtn.onclick = null;
            resolve(val);
        };
        yesBtn.onclick = () => cleanup(true);
        noBtn.onclick = () => cleanup(false);
    });
}

function linkify(text) {
    if (!text) return '';
    const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return safe.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color: var(--accent); text-decoration: underline;" onclick="event.stopPropagation()">🔗 Link</a>');
}

function findSimilarName(value, entries, excludeId) {
    const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const target = normalize(value);
    if (target.length < 3) return null;

    let best = null;
    let bestRatio = Infinity;
    for (const entry of entries) {
        if (entry.id === excludeId) continue;
        const name = normalize(entry.name || entry.title);
        if (name.length < 3) continue;
        if (name.includes(target) || target.includes(name)) return entry;
        if (Math.min(name.length, target.length) / Math.max(name.length, target.length) < 0.7) continue;

        let previous = Array.from({ length: name.length + 1 }, (_, index) => index);
        for (let i = 1; i <= target.length; i++) {
            const current = [i];
            for (let j = 1; j <= name.length; j++) {
                current[j] = Math.min(
                    current[j - 1] + 1,
                    previous[j] + 1,
                    previous[j - 1] + (target[i - 1] === name[j - 1] ? 0 : 1)
                );
            }
            previous = current;
        }
        const distance = previous[name.length];
        const ratio = distance / Math.max(name.length, target.length);
        if (distance <= Math.max(1, Math.floor(Math.max(name.length, target.length) * 0.25)) && ratio < bestRatio) {
            best = entry;
            bestRatio = ratio;
        }
    }
    return best;
}

// OFFLINE-FIRST API FETCH WITH GET CACHE & WRITE OUTBOX QUEUE
async function apiFetch(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const headers = {
        'Content-Type': 'application/json',
        ...authHeaders(),
        ...(options.headers || {})
    };

    try {
        const res = await fetch(url, { ...options, headers });
        if (method === 'GET' && res.ok) {
            const clone = res.clone();
            clone.text().then(txt => {
                try { localStorage.setItem(`p3_cache_${userName}_${url}`, txt); } catch (e) {}
            });
        }
        return res;
    } catch (err) {
        if (method === 'GET') {
            const cached = localStorage.getItem(`p3_cache_${userName}_${url}`);
            if (cached) {
                return new Response(cached, { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
        } else {
            const outbox = JSON.parse(localStorage.getItem('p3_outbox') || '[]');
            outbox.push({ url, options: { method, body: options.body }, user: userName, ts: Date.now() });
            localStorage.setItem('p3_outbox', JSON.stringify(outbox));
            showToast("📡 Saved offline — will sync automatically!");
            return new Response(JSON.stringify({ success: true, offline: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        throw err;
    }
}

async function flushOfflineOutbox() {
    if (!navigator.onLine || !userName || userName === 'Guest') return;
    const raw = localStorage.getItem('p3_outbox');
    if (!raw) return;
    const outbox = JSON.parse(raw);
    if (outbox.length === 0) return;

    const pending = [];
    let synced = 0;
    let networkFailed = false;
    for (const [index, item] of outbox.entries()) {
        if (networkFailed || item.user !== userName) {
            pending.push(item);
            continue;
        }
        try {
            const res = await fetch(item.url, {
                ...item.options,
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeaders()
                }
            });
            if (!res.ok) {
                pending.push(...outbox.slice(index));
                networkFailed = true;
                break;
            }
            synced++;
        } catch (e) {
            pending.push(...outbox.slice(index));
            networkFailed = true;
            break;
        }
    }
    if (pending.length) localStorage.setItem('p3_outbox', JSON.stringify(pending));
    else localStorage.removeItem('p3_outbox');
    if (synced) {
        showToast(`🌐 Synced ${synced} offline update(s)!`);
        if (typeof fetchIdeas === 'function') fetchIdeas();
        if (typeof fetchRestaurants === 'function') fetchRestaurants();
        if (typeof fetchHubData === 'function') fetchHubData();
    }
    if (networkFailed) showToast('Some offline updates are still waiting to sync.', true);
}
window.addEventListener('online', flushOfflineOutbox);

function toggleSavedList(contentId, buttonId, showLabel, hideLabel) {
    const content = document.getElementById(contentId);
    const button = document.getElementById(buttonId);
    if (!content || !button) return;
    const expanded = content.hidden;
    content.hidden = !expanded;
    button.setAttribute('aria-expanded', String(expanded));
    button.innerText = `${expanded ? '−' : '＋'} ${expanded ? hideLabel : showLabel}`;
}

function switchTab(tabId) {
    triggerHaptic(8);
    requestDeviceMotionAccess();
    const mainTabs = document.getElementById('main-tabs');
    if (mainTabs) mainTabs.style.display = 'flex';

    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    const targetTab = document.getElementById(`tab-${tabId}`);
    if (targetTab) targetTab.classList.add('active');
    const targetBtn = document.getElementById(`btn-${tabId}`);
    if (targetBtn) targetBtn.classList.add('active');

    if (tabId === 'food' && typeof isFoodMapViewOpen !== 'undefined' && isFoodMapViewOpen && typeof renderFoodMap === 'function') {
        setTimeout(() => renderFoodMap(), 120);
    }
}

function toggleGuestLogin() {
    const name = document.getElementById('login-name').value;
    const passInput = document.getElementById('password-input');
    passInput.style.display = (name === 'Guest') ? 'none' : 'block';
    checkBiometricButtonVisibility();
}

// FACEID / TOUCHID WEBAUTHN BIOMETRIC UNLOCK
function checkBiometricButtonVisibility() {
    const btn = document.getElementById('bio-unlock-btn');
    if (!btn) return;
    const name = document.getElementById('login-name')?.value || '';
    const enabled = localStorage.getItem(`p3_bio_enabled_${name}`) === '1';
    btn.style.display = (enabled && window.PublicKeyCredential) ? 'block' : 'none';
}

function base64UrlToBuffer(value) {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    return Uint8Array.from(binary, char => char.charCodeAt(0)).buffer;
}

function bufferToBase64Url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function serializePasskeyCredential(credential) {
    const response = credential.response;
    const result = {
        id: credential.id,
        rawId: bufferToBase64Url(credential.rawId),
        type: credential.type,
        response: {
            clientDataJSON: bufferToBase64Url(response.clientDataJSON)
        }
    };
    if (response.attestationObject) {
        result.response.attestationObject = bufferToBase64Url(response.attestationObject);
        result.response.transports = response.getTransports ? response.getTransports() : [];
    } else {
        result.response.authenticatorData = bufferToBase64Url(response.authenticatorData);
        result.response.signature = bufferToBase64Url(response.signature);
        result.response.userHandle = response.userHandle ? bufferToBase64Url(response.userHandle) : null;
    }
    return result;
}

async function registerBiometricIfSupported(name) {
    if (!window.PublicKeyCredential || name === 'Guest') return;
    if (localStorage.getItem(`p3_bio_enabled_${name}`) === '1') return;
    try {
        const statusResponse = await fetch('/api/webauthn/status', { headers: authHeaders() });
        if (!statusResponse.ok) return;
        const status = await statusResponse.json();
        if (status.registered) {
            localStorage.setItem(`p3_bio_enabled_${name}`, '1');
            checkBiometricButtonVisibility();
            return;
        }
        const avail = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if (!avail) return;
        const optionsResponse = await fetch('/api/webauthn/register/options', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({})
        });
        if (!optionsResponse.ok) return;
        const { options, ceremonyId } = await optionsResponse.json();
        options.challenge = base64UrlToBuffer(options.challenge);
        options.user.id = base64UrlToBuffer(options.user.id);
        options.excludeCredentials = (options.excludeCredentials || []).map(item => ({
            ...item, id: base64UrlToBuffer(item.id)
        }));
        const credential = await navigator.credentials.create({ publicKey: options });
        if (!credential) return;
        const verifyResponse = await fetch('/api/webauthn/register/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ ceremonyId, credential: serializePasskeyCredential(credential) })
        });
        const result = await verifyResponse.json();
        if (!verifyResponse.ok || !result.verified) throw new Error(result.error || 'Passkey registration failed');
        localStorage.setItem(`p3_bio_enabled_${name}`, '1');
        showToast('🔐 FaceID / TouchID enabled for this device!');
        checkBiometricButtonVisibility();
    } catch (e) {
        if (e.name !== 'NotAllowedError') showToast(e.message || 'Could not register this passkey.', true);
    }
}

async function unlockWithBiometrics() {
    const name = document.getElementById('login-name').value;
    if (!window.PublicKeyCredential || !name || name === 'Guest') return;
    try {
        const optionsResponse = await fetch('/api/webauthn/login/options', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const data = await optionsResponse.json();
        if (!optionsResponse.ok) throw new Error(data.error || 'Could not start passkey login.');
        data.options.challenge = base64UrlToBuffer(data.options.challenge);
        data.options.allowCredentials = data.options.allowCredentials.map(item => ({
            ...item, id: base64UrlToBuffer(item.id)
        }));
        const credential = await navigator.credentials.get({ publicKey: data.options });
        if (!credential) return;
        const verifyResponse = await fetch('/api/webauthn/login/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ceremonyId: data.ceremonyId, credential: serializePasskeyCredential(credential) })
        });
        const result = await verifyResponse.json();
        if (!verifyResponse.ok || !result.success) throw new Error(result.error || 'Passkey login failed.');
        await completeLogin(result.name);
    } catch (e) {
        if (e.name !== 'NotAllowedError') showToast(e.message || 'Passkey unlock failed.', true);
    }
}

async function completeLogin(name) {
    userName = name;
    userPassword = '';
    localStorage.setItem('userName', userName);
    localStorage.removeItem('userPassword');

    document.getElementById('login-overlay').style.display = 'none';
    await flushOfflineOutbox();
    const welcomeEl = document.getElementById('welcome-text');
    welcomeEl.innerText = `👤 ${userName} ⇄`;
    welcomeEl.style.display = 'inline-block';

    registerBiometricIfSupported(userName);
    fetchIdeas();
    if (typeof fetchRestaurants === 'function') fetchRestaurants();
    if (typeof initLdrHub === 'function') initLdrHub();
    if (typeof checkAutoDailyPrompt === 'function') checkAutoDailyPrompt();
}

async function login() {
    const name = document.getElementById('login-name').value;
    const pass = document.getElementById('password-input').value;

    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password: pass })
    });
    const data = await res.json();

    if (res.ok && data.success) {
        await completeLogin(name);
    } else {
        showToast(data.error || "Login failed", true);
    }
}

async function logout() {
    try {
        const response = await fetch('/api/logout', { method: 'POST' });
        if (!response.ok) showToast('Could not revoke the server session.', true);
    } catch (error) {
        showToast('Could not reach the server to revoke the session.', true);
    }
    userName = '';
    userPassword = '';
    localStorage.removeItem('userName');
    localStorage.removeItem('userPassword');
    document.getElementById('password-input').value = '';
    checkBiometricButtonVisibility();
    document.getElementById('login-overlay').style.display = 'flex';
}

// SHAKE-TO-SPIN ACCELEROMETER HOOK
let lastShakeTime = 0;
let shakeListenerInstalled = false;
let previousGravitySample = null;

function installShakeListener() {
    if (shakeListenerInstalled || !('DeviceMotionEvent' in window)) return;
    shakeListenerInstalled = true;
    window.addEventListener('devicemotion', (event) => {
        const acc = event.acceleration;
        const gravity = event.accelerationIncludingGravity;
        let force = 0;
        if (acc && [acc.x, acc.y, acc.z].every(Number.isFinite)) {
            force = Math.hypot(acc.x, acc.y, acc.z);
            if (force < 14) return;
        } else if (gravity && [gravity.x, gravity.y, gravity.z].every(Number.isFinite)) {
            const sample = [gravity.x, gravity.y, gravity.z];
            if (previousGravitySample) {
                force = Math.hypot(...sample.map((value, i) => value - previousGravitySample[i]));
            }
            previousGravitySample = sample;
            if (force < 16) return;
        } else {
            return;
        }

        if (Date.now() - lastShakeTime < 2500) return;
        const playActive = document.getElementById('tab-play')?.classList.contains('active');
        const foodActive = document.getElementById('tab-food')?.classList.contains('active');
        const spin = playActive ? window.pickRandom : foodActive ? window.pickRandomRestaurant : null;
        if (!spin) return;

        const modalOpen = ['login-overlay', 'result-overlay', 'memory-overlay'].some(id => {
            const el = document.getElementById(id);
            return el && el.style.display === 'flex';
        });
        if (modalOpen) return;

        lastShakeTime = Date.now();
        triggerHaptic(8);
        setTimeout(() => triggerHaptic(14), 90);
        setTimeout(() => {
            triggerHaptic(20);
            const tabStillActive = playActive
                ? document.getElementById('tab-play')?.classList.contains('active')
                : document.getElementById('tab-food')?.classList.contains('active');
            if (tabStillActive) spin();
        }, 190);
    });
}

function requestDeviceMotionAccess() {
    if (!('DeviceMotionEvent' in window)) return;
    if (shakeListenerInstalled) return;
    const motionEvent = window.DeviceMotionEvent;
    if (typeof motionEvent.requestPermission !== 'function') {
        installShakeListener();
        return;
    }
    motionEvent.requestPermission().then(permission => {
        if (permission === 'granted') installShakeListener();
    }).catch(() => {});
}

function initShakeToSpin() {
    if (typeof window.DeviceMotionEvent?.requestPermission !== 'function') installShakeListener();
}
initShakeToSpin();
setTimeout(checkBiometricButtonVisibility, 400);
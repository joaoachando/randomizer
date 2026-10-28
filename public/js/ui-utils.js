let userName = localStorage.getItem('userName') || '';
let userPassword = localStorage.getItem('userPassword') || '';

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

// OFFLINE-FIRST API FETCH WITH GET CACHE & WRITE OUTBOX QUEUE
async function apiFetch(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const headers = {
        'Content-Type': 'application/json',
        'x-user-name': userName,
        'x-user-password': userPassword,
        ...(options.headers || {})
    };

    try {
        const res = await fetch(url, { ...options, headers });
        if (method === 'GET' && res.ok) {
            const clone = res.clone();
            clone.text().then(txt => {
                try { localStorage.setItem(`p3_cache_${url}`, txt); } catch (e) {}
            });
        }
        return res;
    } catch (err) {
        if (method === 'GET') {
            const cached = localStorage.getItem(`p3_cache_${url}`);
            if (cached) {
                return new Response(cached, { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
        } else {
            const outbox = JSON.parse(localStorage.getItem('p3_outbox') || '[]');
            outbox.push({ url, options: { method, body: options.body }, ts: Date.now() });
            localStorage.setItem('p3_outbox', JSON.stringify(outbox));
            showToast("📡 Saved offline — will sync automatically!");
            return new Response(JSON.stringify({ success: true, offline: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        throw err;
    }
}

async function flushOfflineOutbox() {
    const raw = localStorage.getItem('p3_outbox');
    if (!raw) return;
    const outbox = JSON.parse(raw);
    if (outbox.length === 0) return;

    localStorage.removeItem('p3_outbox');
    for (const item of outbox) {
        try {
            await apiFetch(item.url, item.options);
        } catch (e) {}
    }
    showToast(`🌐 Synced ${outbox.length} offline update(s)!`);
    if (typeof fetchIdeas === 'function') fetchIdeas();
    if (typeof fetchRestaurants === 'function') fetchRestaurants();
    if (typeof fetchHubData === 'function') fetchHubData();
}
window.addEventListener('online', flushOfflineOutbox);

function switchTab(tabId) {
    triggerHaptic(8);
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
    const savedVault = localStorage.getItem('p3_bio_vault');
    btn.style.display = (savedVault && window.PublicKeyCredential) ? 'block' : 'none';
}

async function registerBiometricIfSupported(name, password) {
    if (!window.PublicKeyCredential || name === 'Guest') return;
    if (localStorage.getItem('p3_bio_vault')) return;
    try {
        const avail = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if (!avail) return;
        const challenge = crypto.getRandomValues(new Uint8Array(32));
        const userId = crypto.getRandomValues(new Uint8Array(16));
        const cred = await navigator.credentials.create({
            publicKey: {
                challenge,
                rp: { name: "P³ App" },
                user: { id: userId, name, displayName: name },
                pubKeyCredParams: [{ alg: -7, type: "public-key" }],
                authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
                timeout: 30000
            }
        });
        if (cred) {
            localStorage.setItem('p3_bio_vault', JSON.stringify({ name, password }));
            showToast("🔐 FaceID / TouchID enabled for next time!");
        }
    } catch (e) {}
}

async function unlockWithBiometrics() {
    const raw = localStorage.getItem('p3_bio_vault');
    if (!raw || !window.PublicKeyCredential) return;
    try {
        const challenge = crypto.getRandomValues(new Uint8Array(32));
        await navigator.credentials.get({
            publicKey: { challenge, userVerification: "required", timeout: 30000 }
        });
        const vault = JSON.parse(raw);
        document.getElementById('login-name').value = vault.name;
        document.getElementById('password-input').value = vault.password;
        await login();
    } catch (e) {
        showToast("Biometric unlock cancelled", true);
    }
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
        userName = name;
        userPassword = (name === 'Guest') ? 'guest' : pass;
        localStorage.setItem('userName', userName);
        localStorage.setItem('userPassword', userPassword);

        document.getElementById('login-overlay').style.display = 'none';
        const welcomeEl = document.getElementById('welcome-text');
        welcomeEl.innerText = `👤 ${userName} ⇄`;
        welcomeEl.style.display = 'inline-block';

        registerBiometricIfSupported(userName, userPassword);
        fetchIdeas();
        if (typeof fetchRestaurants === 'function') fetchRestaurants();
        if (typeof initLdrHub === 'function') initLdrHub();
        if (typeof checkAutoDailyPrompt === 'function') checkAutoDailyPrompt();
    } else {
        showToast(data.error || "Login failed", true);
    }
}

function logout() {
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
function initShakeToSpin() {
    if (!('DeviceMotionEvent' in window)) return;
    window.addEventListener('devicemotion', (event) => {
        const acc = event.accelerationIncludingGravity;
        if (!acc) return;
        const totalForce = Math.abs(acc.x || 0) + Math.abs(acc.y || 0) + Math.abs(acc.z || 0);
        if (totalForce > 38 && (Date.now() - lastShakeTime > 2500)) {
            const modalOpen = ['login-overlay', 'result-overlay', 'memory-overlay'].some(id => {
                const el = document.getElementById(id);
                return el && el.style.display === 'flex';
            });
            if (modalOpen) return;

            const playActive = document.getElementById('tab-play')?.classList.contains('active');
            const foodActive = document.getElementById('tab-food')?.classList.contains('active');
            if (playActive && typeof pickRandom === 'function') {
                lastShakeTime = Date.now();
                triggerHaptic([30, 50, 40]);
                pickRandom();
            } else if (foodActive && typeof pickRandomRestaurant === 'function') {
                lastShakeTime = Date.now();
                triggerHaptic([30, 50, 40]);
                pickRandomRestaurant();
            }
        }
    });
}
initShakeToSpin();
setTimeout(checkBiometricButtonVisibility, 400);
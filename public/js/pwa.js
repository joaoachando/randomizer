let pwaUpdateReloading = false;

function isPwaInstalled() {
    return window.matchMedia?.('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;
}

function showPwaInstallControl() {
    const button = document.getElementById('btn-install-app');
    if (!button) return;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    button.style.display = !isPwaInstalled() &&
        (Boolean(window.deferredPwaInstallPrompt) || isIos) ? 'inline-flex' : 'none';
}

async function installPwaApp() {
    const installPrompt = window.deferredPwaInstallPrompt;
    if (!installPrompt) {
        showToast(/iphone|ipad|ipod/i.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
            ? 'To install: tap Share, then “Add to Home Screen”.'
            : 'Use your browser menu and choose “Install app” or “Add to Home Screen”.');
        return;
    }

    await installPrompt.prompt();
    await installPrompt.userChoice;
    window.deferredPwaInstallPrompt = null;
    showPwaInstallControl();
}

function showPwaUpdateNotice() {
    const banner = document.getElementById('pwa-update-banner');
    if (banner) banner.style.display = 'flex';
}

async function applyPwaUpdate() {
    const registration = window.pwaServiceWorkerRegistration;
    if (!registration) return showToast('Could not find the pending app update.', true);
    if (!registration.waiting) {
        await registration.update();
        if (!registration.waiting) return showToast('P³ is already up to date.');
    }

    pwaUpdateReloading = true;
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
}

async function initPwaFeatures() {
    showPwaInstallControl();
    if (!('serviceWorker' in navigator)) return;

    const registration = window.pwaServiceWorkerRegistration ||
        await navigator.serviceWorker.ready;
    window.pwaServiceWorkerRegistration = registration;

    const showIfUpdateWaiting = () => {
        if (registration.waiting && navigator.serviceWorker.controller) showPwaUpdateNotice();
    };
    const watchInstallingWorker = installing => {
        if (!installing) return;
        installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                showPwaUpdateNotice();
            }
        });
    };
    showIfUpdateWaiting();
    watchInstallingWorker(registration.installing);
    registration.addEventListener('updatefound', () => {
        watchInstallingWorker(registration.installing);
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (pwaUpdateReloading) window.location.reload();
    });

    registration.update().catch(error => {
        console.warn('PWA update check failed:', error);
    });
}

initPwaFeatures().catch(error => {
    console.warn('PWA setup failed:', error);
});

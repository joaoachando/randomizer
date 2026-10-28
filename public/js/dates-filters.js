let ideas = [];
let editingIdeaId = null;
let lastRolledWinnerId = null;
let completingIdeaId = null;
let selectedHeartRating = 5;
let masterQuickFilter = 'all';

const CATEGORIES = [
    { key: 'location', label: 'Location', def: 'indoor', options: [
            { val: 'indoor', text: '🏠 Indoor' },
            { val: 'outdoor', text: '🌳 Outdoor' }
        ]},
    { key: 'duration', label: 'Duration', def: 'short', options: [
            { val: 'short', text: '⚡ Short (<2h)' },
            { val: 'long', text: '⏳ Long (2h+)' }
        ]},
    { key: 'effort', label: 'Effort', def: 'low', options: [
            { val: 'low', text: '🛋️ Low Effort' },
            { val: 'high', text: '🏃 High Effort' }
        ]},
    { key: 'budget', label: 'Budget', def: 'free', options: [
            { val: 'free', text: '🆓 Free' },
            { val: 'cheap', text: '💵 Cheap ($)' },
            { val: 'splurge', text: '💎 Splurge ($$$)' }
        ]},
    { key: 'vibe', label: 'Vibe', def: 'creative', options: [
            { val: 'creative', text: '🎨 Creative' },
            { val: 'competitive', text: '🏆 Competitive' },
            { val: 'romantic', text: '🕯️ Romantic' },
            { val: 'productive', text: '🧹 Productive' }
        ]},
    { key: 'food', label: 'Food', def: 'none', options: [
            { val: 'none', text: '🚫 No Food' },
            { val: 'snack', text: '🍿 Snacks/Drinks' },
            { val: 'meal', text: '🍽️ Full Meal' }
        ]},
    { key: 'timeOfDay', label: 'Time of Day', def: 'any', options: [
            { val: 'any', text: '🔄 Anytime', hideInPlay: true },
            { val: 'day', text: '☀️ Daytime' },
            { val: 'night', text: '🌙 Nighttime' }
        ]},
    { key: 'social', label: 'Social Battery', def: 'us', options: [
            { val: 'us', text: '👩‍❤️‍👨 Just Us' },
            { val: 'social', text: '🍻 Social/Crowds' }
        ]},
    { key: 'prep', label: 'Prep Level', def: 'spontaneous', options: [
            { val: 'spontaneous', text: '⚡ Spontaneous' },
            { val: 'planned', text: '📅 Needs Planning' }
        ]}
];

const SPICY_PLAY_OPTIONS = [
    { val: 'exclude', text: '😇 Vanilla Only' },
    { val: 'only', text: '🌶️ Only Spicy' }
];

let playState = {};
let addState = {};

function askShareDestination(caption) {
    return new Promise(resolve => {
        const overlay = document.getElementById('confirm-overlay');
        const msgEl = document.getElementById('confirm-message');
        const yesBtn = document.getElementById('confirm-yes-btn');
        const noBtn = document.getElementById('confirm-no-btn');

        msgEl.innerText = `📲 Shared Link:\n"${caption}"\n\nWhere do you want to save this?`;
        yesBtn.innerText = '🍽️ Food Spot';
        noBtn.innerText = '🎲 Date Idea';
        overlay.style.display = 'flex';

        const cleanup = (choice) => {
            overlay.style.display = 'none';
            yesBtn.innerText = 'Confirm';
            noBtn.innerText = 'Cancel';
            yesBtn.onclick = null;
            noBtn.onclick = null;
            resolve(choice);
        };

        yesBtn.onclick = () => cleanup('food');
        noBtn.onclick = () => cleanup('date');
    });
}

async function initAppOnLoad() {
    const params = new URLSearchParams(window.location.search);
    const sharedTitle = params.get('title') || '';
    const sharedText = params.get('text') || '';
    const sharedUrl = params.get('url') || '';

    const fullShare = `${sharedTitle} ${sharedText} ${sharedUrl}`.trim();
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const extractedUrls = fullShare.match(urlRegex);
    const link = extractedUrls ? extractedUrls[0] : null;

    await initAuth();

    if (link) {
        let caption = fullShare.replace(link, '').trim();
        caption = caption.replace(/Check out this video!/gi, '').replace(/Watch this reel by.*/gi, '').trim();

        if (!caption) {
            if (link.includes('tiktok.com')) caption = "📱 TikTok Spot";
            else if (link.includes('instagram.com')) caption = "📸 Instagram Spot";
            else caption = "💡 Shared Spot";
        }

        window.history.replaceState({}, document.title, "/");
        const dest = await askShareDestination(caption);

        if (dest === 'food') {
            switchTab('food');
            const drawer = document.getElementById('food-form-drawer');
            if (drawer) drawer.style.display = 'block';

            const isMaps = link.includes('maps.app.goo.gl') || link.includes('google.com/maps') || link.includes('goo.gl/maps');
            if (isMaps) {
                document.getElementById('r-maps').value = link;
            } else {
                document.getElementById('r-social').value = link;
            }

            if (caption.length <= 40) {
                document.getElementById('r-name').value = caption;
            } else {
                document.getElementById('r-name').value = caption.slice(0, 35).trim();
                document.getElementById('r-notes').value = caption;
            }
            window.scrollTo({ top: 0, behavior: 'smooth' });
            showToast("Loaded into Food Spots! 🍽️");
        } else {
            switchTab('play');
            const drawer = document.getElementById('date-form-drawer');
            if (drawer) drawer.style.display = 'block';
            document.getElementById('n-title').value = caption;
            document.getElementById('n-description').value = link;
            window.scrollTo({ top: 0, behavior: 'smooth' });
            showToast("Loaded into Date Ideas! 🎲");
        }
    }
}

async function initAuth() {
    initChipUI();
    const loginOverlay = document.getElementById('login-overlay');
    if (!userName || !userPassword) {
        loginOverlay.style.display = 'flex';
        return;
    }

    try {
        const res = await fetch('/api/ideas', {
            headers: {
                'x-user-name': userName,
                'x-user-password': userPassword
            }
        });
        if (!res.ok) {
            if (res.status === 401) {
                userName = '';
                userPassword = '';
                localStorage.removeItem('userName');
                localStorage.removeItem('userPassword');
                showToast('Your saved login is no longer valid. Please sign in again.', true);
            }
            throw new Error(`Auth check failed with status ${res.status}`);
        }

        loginOverlay.style.display = 'none';
        const welcomeEl = document.getElementById('welcome-text');
        welcomeEl.innerText = `👤 ${userName} ⇄`;
        welcomeEl.style.display = 'inline-flex';
        renderPlayChips();
        fetchIdeas();
        if (typeof initLdrHub === 'function') initLdrHub();
        if (typeof fetchRestaurants === 'function') fetchRestaurants();
        if (typeof checkDailyCheckInPrompt === 'function') checkDailyCheckInPrompt();
    } catch (e) {
        console.error("Auth check failed", e);
        loginOverlay.style.display = 'flex';
        if (userName && userPassword) {
            showToast('Could not verify your login. Please try again.', true);
        }
    }
}

function initChipUI() {
    CATEGORIES.forEach(c => {
        playState[c.key] = 'any';
        addState[c.key] = c.def;
    });
    playState.spicy = 'any';

    renderPlayChips();
    renderAddChips();
}

function renderPlayChips() {
    const container = document.getElementById('play-filters-container');
    let html = '<div class="filters-grid">';

    CATEGORIES.forEach(cat => {
        const visibleOpts = cat.options.filter(o => !o.hideInPlay);
        const spanClass = visibleOpts.length > 2 ? 'full-width' : '';
        html += `<div class="filter-section ${spanClass}"><span class="filter-label">${cat.label}</span><div class="chip-row">`;
        visibleOpts.forEach(opt => {
            const active = playState[cat.key] === opt.val ? 'active' : '';
            html += `<label class="chip ${active}"><input type="checkbox" switch class="ios-taptic" onchange="togglePlayChip('${cat.key}', '${opt.val}')">${opt.text}</label>`;
        });
        html += `</div></div>`;
    });

    if (userName !== 'Guest') {
        html += `<div class="filter-section"><span class="filter-label">Spice Level</span><div class="chip-row">`;
        SPICY_PLAY_OPTIONS.forEach(opt => {
            const active = playState.spicy === opt.val ? 'active' : '';
            html += `<label class="chip ${active}"><input type="checkbox" switch class="ios-taptic" onchange="togglePlayChip('spicy', '${opt.val}')">${opt.text}</label>`;
        });
        html += `</div></div>`;
    }

    html += '</div>';
    container.innerHTML = html;

    const activeCount = Object.values(playState).filter(v => v !== 'any').length;
    const toggleText = document.getElementById('filter-toggle-text');
    if (toggleText) {
        toggleText.innerText = activeCount > 0 ? `⚙️ Customize Filters (${activeCount} active)` : '⚙️ Customize Filters';
    }
}

function toggleFilterDrawer() {
    const drawer = document.getElementById('filter-drawer');
    const chevron = document.getElementById('filter-chevron');
    const isOpen = drawer.classList.toggle('open');
    chevron.innerText = isOpen ? '▲ Hide' : '▼ Show';
}

function renderAddChips() {
    const container = document.getElementById('add-filters-container');
    let html = '<div class="filters-grid">';

    CATEGORIES.forEach(cat => {
        const spanClass = cat.options.length > 2 ? 'full-width' : '';
        html += `<div class="filter-section ${spanClass}"><span class="filter-label">${cat.label}</span><div class="chip-row">`;
        cat.options.forEach(opt => {
            const active = addState[cat.key] === opt.val ? 'active' : '';
            html += `<label class="chip ${active}"><input type="checkbox" switch class="ios-taptic" onchange="selectAddChip('${cat.key}', '${opt.val}')">${opt.text}</label>`;
        });
        html += `</div></div>`;
    });

    html += '</div>';
    container.innerHTML = html;
}

function togglePlayChip(key, val) {
    triggerHaptic(8);
    playState[key] = (playState[key] === val) ? 'any' : val;
    renderPlayChips();
}

function selectAddChip(key, val) {
    triggerHaptic(8);
    addState[key] = val;
    renderAddChips();
}

function resetFilters() {
    triggerHaptic(10);
    Object.keys(playState).forEach(k => playState[k] = 'any');
    renderPlayChips();
    showToast("Filters reset");
}
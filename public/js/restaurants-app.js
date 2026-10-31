let restaurants = [];
let editingRestaurantId = null;
let completingRestaurantId = null;
let activeSpotMode = 'all'; // 'all' | 'dining' | 'cafe' | 'cook'
let activeFoodCity = 'all';
let activeFoodCuisine = 'all';
let activeFoodTrip = 'all';
let isEditingCuisineTags = false;
let isFoodMapViewOpen = false;
let hasLoadedRestaurants = false;

let pendingSpotLat = null;
let pendingSpotLng = null;
let pendingSpotThumb = '';
let instagramEmbedScriptLoading = false;

const DEFAULT_CUISINES = [
    '🍝 Italian', '🍣 Sushi/Asian', '🌮 Mexican', '🍔 Burgers',
    '🥐 Brunch/Cafe', '🥩 Steakhouse', '🦐 Seafood', '🍸 Bar/Tapas', '🍦 Dessert'
];
let customCuisines = [...DEFAULT_CUISINES];

let formCuisine = '🍝 Italian';
let formVibe = '🕯️ Date Night';
let formPrice = '$$';

const FOOD_VIBE_OPTIONS = ['👟 Casual', '🕯️ Date Night', '💎 Fancy/Book', '⚡ Quick Bite'];
const FOOD_PRICE_OPTIONS = ['$', '$$', '$$$'];

function checkRestaurantDuplicate(val) {
    const warnEl = document.getElementById('r-dup-warning');
    if (!warnEl) return;
    const clean = (val || '').trim().toLowerCase();
    if (clean.length < 3) {
        warnEl.style.display = 'none';
        return;
    }
    const match = findSimilarName(clean, restaurants, editingRestaurantId);
    if (match) {
        warnEl.style.display = 'block';
        warnEl.innerText = `⚠️ Looks similar to "${match.name}" (${match.city}) already on your list!`;
    } else {
        warnEl.style.display = 'none';
    }
}

async function autoFillFromMapsLink() {
    const mapsInput = document.getElementById('r-maps');
    const url = (mapsInput?.value || '').trim();
    if (!url.startsWith('http')) return;

    const nameInput = document.getElementById('r-name');
    const cityInput = document.getElementById('r-city');
    const neighInput = document.getElementById('r-neighborhood');

    showToast("🔍 Reading Google Maps link...");
    try {
        const res = await apiFetch('/api/maps-autofill', {
            method: 'POST',
            body: JSON.stringify({ url })
        });
        const data = await res.json();
        if (data.name && !nameInput.value) {
            nameInput.value = data.name;
            checkRestaurantDuplicate(data.name);
        }
        if (data.city && !cityInput.value) cityInput.value = data.city;
        if (data.neighborhood && neighInput && !neighInput.value) neighInput.value = data.neighborhood;
        const latitude = data.lat === null || data.lat === '' ? NaN : Number(data.lat);
        const longitude = data.lng === null || data.lng === '' ? NaN : Number(data.lng);
        const hasExactPin = Number.isFinite(latitude) && Number.isFinite(longitude) &&
            Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
        if (hasExactPin) {
            pendingSpotLat = latitude;
            pendingSpotLng = longitude;
        } else {
            pendingSpotLat = null;
            pendingSpotLng = null;
            showToast('Could not read the exact pin from that link. This spot will not be plotted until exact coordinates are available.', true);
        }
        if ((data.name || data.city) && hasExactPin) {
            triggerHaptic(12);
            showToast(`📍 Auto-filled: ${data.name || 'Spot'} ${data.neighborhood ? `• ${data.neighborhood}` : ''}`);
        } else if (data.name || data.city) {
            triggerHaptic(12);
            showToast(`📍 Auto-filled: ${data.name || 'Spot'} • Exact map pin unavailable`, true);
        }
    } catch (e) {
        showToast(e.message || 'Could not read the Google Maps location.', true);
    }
}

async function autoFetchSocialThumb() {
    const url = (document.getElementById('r-social')?.value || '').trim();
    if (!url.startsWith('http')) return;
    pendingSpotThumb = '';
    const thumbBox = document.getElementById('r-thumb-preview-box');
    if (thumbBox) thumbBox.style.display = 'none';
    const instagramUrl = getInstagramPermalink(url);
    if (instagramUrl) {
        renderInstagramEmbedPreview(instagramUrl);
        showToast('📸 Instagram preview uses its official embed.');
        return;
    }
    clearInstagramEmbedPreview();
    try {
        const res = await apiFetch('/api/social-oembed', {
            method: 'POST',
            body: JSON.stringify({ url })
        });
        const data = await res.json();
        if (data.thumbnailUrl) {
            pendingSpotThumb = data.thumbnailUrl;
            const box = document.getElementById('r-thumb-preview-box');
            const img = document.getElementById('r-thumb-preview-img');
            if (box && img) {
                img.src = pendingSpotThumb;
                box.style.display = 'flex';
            }
            showToast("🎬 Attached video thumbnail!");
        }
    } catch (e) {}
}

function getInstagramPermalink(value) {
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || !/(^|\.)instagram\.com$/i.test(url.hostname)) return '';
        const match = url.pathname.match(/^\/(p|reel|tv)\/([A-Za-z0-9_-]+)\/?$/i);
        if (!match) return '';
        return `https://www.instagram.com/${match[1].toLowerCase()}/${match[2]}/`;
    } catch (e) {
        return '';
    }
}

function instagramEmbedMarkup(url) {
    return `<blockquote class="instagram-media spot-instagram-embed" data-instgrm-permalink="${url}" data-instgrm-version="14">
        <a href="${url}" target="_blank" rel="noopener">View this Instagram post or Reel</a>
    </blockquote>`;
}

function processInstagramEmbeds() {
    if (window.instgrm?.Embeds) {
        window.instgrm.Embeds.process();
        return;
    }
    if (instagramEmbedScriptLoading) return;
    instagramEmbedScriptLoading = true;
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.instagram.com/embed.js';
    script.onload = () => {
        instagramEmbedScriptLoading = false;
        window.instgrm?.Embeds?.process();
    };
    script.onerror = () => {
        instagramEmbedScriptLoading = false;
    };
    document.head.appendChild(script);
}

function renderInstagramEmbedPreview(url) {
    const preview = document.getElementById('r-instagram-preview');
    if (!preview) return;
    preview.innerHTML = instagramEmbedMarkup(url);
    preview.style.display = 'block';
    processInstagramEmbeds();
}

function clearInstagramEmbedPreview() {
    const preview = document.getElementById('r-instagram-preview');
    if (preview) {
        preview.innerHTML = '';
        preview.style.display = 'none';
    }
}

function clearPendingThumb() {
    pendingSpotThumb = '';
    const box = document.getElementById('r-thumb-preview-box');
    if (box) box.style.display = 'none';
    clearInstagramEmbedPreview();
}

async function fetchRestaurants() {
    if (userName === 'Guest') {
        renderRestaurantFormChips();
        renderRestaurantList();
        return;
    }
    if (!hasLoadedRestaurants) renderLoadingSkeleton(document.getElementById('food-ul'));
    try {
        const res = await apiFetch('/api/restaurants');
        const data = await res.json();
        restaurants = data.restaurants || [];
        hasLoadedRestaurants = true;
        if (data.customCuisines && data.customCuisines.length > 0) {
            customCuisines = data.customCuisines;
        }
        if (!customCuisines.includes(formCuisine) && customCuisines.length > 0) {
            formCuisine = customCuisines[0];
        }
        renderRestaurantFormChips();
        renderRestaurantList();
        if (typeof renderList === 'function') renderList();
        if (typeof checkWrappedVisibility === 'function') checkWrappedVisibility();
    } catch (e) {
        if (!hasLoadedRestaurants) {
            const list = document.getElementById('food-ul');
            if (list) list.innerHTML = '<li class="idea-item" style="text-align:center;opacity:0.7;">Could not load spots. Check your connection and try again.</li>';
        }
    }
}

function toggleFoodFormDrawer() {
    triggerHaptic(8);
    const drawer = document.getElementById('food-form-drawer');
    if (!drawer) return;
    const isHidden = drawer.style.display === 'none';
    drawer.style.display = isHidden ? 'block' : 'none';
    if (isHidden) {
        document.getElementById('r-spot-type').value = activeSpotMode === 'all' ? 'dining' : activeSpotMode;
    } else {
        editingRestaurantId = null;
        pendingSpotLat = null;
        pendingSpotLng = null;
        clearPendingThumb();
        const warnEl = document.getElementById('r-dup-warning');
        if (warnEl) warnEl.style.display = 'none';
        document.getElementById('food-form-title').innerText = '➕ Save New Food Spot';
        document.getElementById('r-save-btn').innerText = '💾 Save Spot';
    }
}

function toggleEditCuisineTags() {
    triggerHaptic(8);
    isEditingCuisineTags = !isEditingCuisineTags;
    const btn = document.getElementById('edit-cuisines-btn');
    if (btn) {
        btn.innerText = isEditingCuisineTags ? '✅ Done' : '✏️ Edit Cuisines';
        btn.style.borderColor = isEditingCuisineTags ? '#ef4444' : 'var(--border)';
        btn.style.color = isEditingCuisineTags ? '#ef4444' : 'var(--text-main)';
    }
    renderRestaurantFormChips();
}

async function addCustomCuisineTag() {
    const input = document.getElementById('custom-cuisine-input');
    const tag = (input?.value || '').trim();
    if (!tag) return showToast("Enter a cuisine name first!", true);
    triggerHaptic(12);
    if (userName !== 'Guest') {
        await apiFetch('/api/custom-cuisines', { method: 'POST', body: JSON.stringify({ tag }) });
    }
    input.value = '';
    if (!customCuisines.includes(tag)) customCuisines.push(tag);
    formCuisine = tag;
    renderRestaurantFormChips();
    renderRestaurantList();
    showToast(`Added "${tag}"`);
}

async function deleteCustomCuisineTag(tag) {
    if (!(await askConfirm(`Remove "${tag}" from your cuisine buttons?`))) return;
    if (userName !== 'Guest') {
        await apiFetch(`/api/custom-cuisines/${encodeURIComponent(tag)}`, { method: 'DELETE' });
    }
    customCuisines = customCuisines.filter(c => c !== tag);
    if (formCuisine === tag) formCuisine = customCuisines[0] || '🍽️ Other';
    if (activeFoodCuisine === tag) activeFoodCuisine = 'all';
    renderRestaurantFormChips();
    renderRestaurantList();
    showToast(`Removed "${tag}"`);
}

function renderRestaurantFormChips() {
    const cWrap = document.getElementById('r-cuisine-chips');
    if (!cWrap) return;

    cWrap.innerHTML = customCuisines.map(c => {
        const esc = c.replace(/'/g, "\\'");
        if (isEditingCuisineTags) {
            return `<label class="chip delete-mode"><input type="checkbox" switch class="ios-taptic" onchange="deleteCustomCuisineTag('${esc}')">${c} ✖</label>`;
        }
        const active = formCuisine === c ? 'active' : '';
        return `<label class="chip ${active}"><input type="checkbox" switch class="ios-taptic" onchange="setFoodFormChip('cuisine', '${esc}')">${c}</label>`;
    }).join('');

    document.getElementById('r-vibe-chips').innerHTML = FOOD_VIBE_OPTIONS.map(v => {
        const active = formVibe === v ? 'active' : '';
        return `<label class="chip ${active}"><input type="checkbox" switch class="ios-taptic" onchange="setFoodFormChip('vibe', '${v}')">${v}</label>`;
    }).join('');

    document.getElementById('r-price-chips').innerHTML = FOOD_PRICE_OPTIONS.map(p => {
        const active = formPrice === p ? 'active' : '';
        return `<label class="chip ${active}"><input type="checkbox" switch class="ios-taptic" onchange="setFoodFormChip('price', '${p}')">${p}</label>`;
    }).join('');

    const cities = [...new Set(restaurants.map(r => r.city).filter(Boolean))];
    const dl = document.getElementById('city-suggestions');
    if (dl) dl.innerHTML = cities.map(c => `<option value="${c}">`).join('');

    const ideaTrips = (typeof ideas !== 'undefined' ? ideas : []).map(i => i.tripFolder).filter(Boolean);
    const trips = [...new Set([...restaurants.map(r => r.tripFolder).filter(Boolean), ...ideaTrips])];
    const tdl = document.getElementById('trip-folder-suggestions');
    if (tdl) tdl.innerHTML = trips.map(t => `<option value="${t}">`).join('');
}

function setFoodFormChip(type, val) {
    triggerHaptic(8);
    if (type === 'cuisine') formCuisine = val;
    if (type === 'vibe') formVibe = val;
    if (type === 'price') formPrice = val;
    renderRestaurantFormChips();
}

async function saveRestaurant() {
    if (userName === 'Guest') return showToast("Guests cannot add spots.", true);
    const name = document.getElementById('r-name').value.trim();
    const city = document.getElementById('r-city').value.trim();
    if (!name || !city) return showToast("Enter both spot name and city!", true);

    const payload = {
        name, city,
        neighborhood: document.getElementById('r-neighborhood').value.trim(),
        cuisine: formCuisine, vibe: formVibe, price: formPrice,
        socialLink: document.getElementById('r-social').value.trim(),
        mapsLink: document.getElementById('r-maps').value.trim(),
        mustOrder: document.getElementById('r-notes').value.trim(),
        spotType: document.getElementById('r-spot-type').value || 'dining',
        tripFolder: document.getElementById('r-trip').value.trim(),
        thumbnailUrl: pendingSpotThumb || '',
        lat: pendingSpotLat,
        lng: pendingSpotLng
    };

    let response;
    if (editingRestaurantId) {
        response = await apiFetch(`/api/restaurants/${editingRestaurantId}`, { method: 'PATCH', body: JSON.stringify(payload) });
    } else {
        response = await apiFetch('/api/restaurants', { method: 'POST', body: JSON.stringify(payload) });
    }
    const result = await response.json();
    if (!response.ok) return showToast(result.error || 'Could not save this spot.', true);
    if (result.locationResolved) showToast(editingRestaurantId ? 'Spot updated! ✨' : `Saved "${name}" in ${city}! 🍽️`);
    else showToast(`Saved "${name}", but couldn't find its exact map location from the name and city. Add a Google Maps link for a pin.`, true);

    editingRestaurantId = null;
    pendingSpotLat = null;
    pendingSpotLng = null;
    clearPendingThumb();
    ['r-name', 'r-city', 'r-neighborhood', 'r-social', 'r-maps', 'r-notes', 'r-trip'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('food-form-drawer').style.display = 'none';
    fetchRestaurants();
}

function editRestaurant(id) {
    const r = restaurants.find(x => x.id === id);
    if (!r) return;
    editingRestaurantId = id;
    document.getElementById('r-name').value = r.name;
    document.getElementById('r-city').value = r.city;
    document.getElementById('r-neighborhood').value = r.neighborhood || '';
    document.getElementById('r-social').value = r.socialLink || '';
    document.getElementById('r-maps').value = r.mapsLink || '';
    document.getElementById('r-notes').value = r.mustOrder || '';
    document.getElementById('r-spot-type').value = r.spotType || 'dining';
    document.getElementById('r-trip').value = r.tripFolder || '';
    pendingSpotLat = r.lat || null;
    pendingSpotLng = r.lng || null;
    const instagramUrl = getInstagramPermalink(r.socialLink || '');
    pendingSpotThumb = instagramUrl ? '' : (r.thumbnailUrl || '');
    if (instagramUrl) renderInstagramEmbedPreview(instagramUrl);
    else clearInstagramEmbedPreview();

    const box = document.getElementById('r-thumb-preview-box');
    const img = document.getElementById('r-thumb-preview-img');
    if (box && img) {
        if (pendingSpotThumb) { img.src = pendingSpotThumb; box.style.display = 'flex'; }
        else { box.style.display = 'none'; }
    }

    formCuisine = r.cuisine || customCuisines[0] || '🍝 Italian';
    if (!customCuisines.includes(formCuisine)) customCuisines.push(formCuisine);
    formVibe = r.vibe || '🕯️ Date Night';
    formPrice = r.price || '$$';
    renderRestaurantFormChips();

    document.getElementById('food-form-title').innerText = '✏️ Edit Spot';
    document.getElementById('r-save-btn').innerText = '💾 Update Spot';
    document.getElementById('food-form-drawer').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteRestaurant(id) {
    if (userName === 'Guest') return showToast("Guests cannot delete spots.", true);
    if (!(await askConfirm("Remove this spot from your list?"))) return;
    await apiFetch(`/api/restaurants/${id}`, { method: 'DELETE' });
    showToast("Spot removed");
    fetchRestaurants();
}

function markRestaurantVisited(id) {
    if (userName === 'Guest') return showToast("Guests cannot modify spots.", true);
    const r = restaurants.find(x => x.id === id);
    if (!r) return;
    completingIdeaId = null;
    completingRestaurantId = id;
    if (typeof openSplitMemoryModal === 'function') {
        openSplitMemoryModal('🍽️ Spot Visited!', `${r.name} (${r.city})`, r.joaoRating, r.jennaRating, r.review || '', r.photoData || '');
    } else {
        selectedHeartRating = r.rating || 5;
        document.getElementById('memory-modal-heading').innerText = '🍽️ Spot Visited!';
        document.getElementById('memory-date-title').innerText = `${r.name} (${r.city})`;
        document.getElementById('memory-note-input').value = r.review || '';
        renderHeartSelector();
        document.getElementById('memory-overlay').style.display = 'flex';
    }
}

function setFoodFilter(type, val) {
    triggerHaptic(8);
    if (type === 'type') {
        activeSpotMode = (activeSpotMode === val && val !== 'all') ? 'all' : val;
        ['all', 'dining', 'cafe', 'cook'].forEach(k => {
            document.getElementById(`type-chip-${k}`)?.classList.toggle('active', activeSpotMode === k);
        });
    }
    if (type === 'city') activeFoodCity = val;
    if (type === 'trip') activeFoodTrip = (activeFoodTrip === val) ? 'all' : val;
    if (type === 'cuisine') activeFoodCuisine = (activeFoodCuisine === val) ? 'all' : val;
    renderRestaurantList();
}

function renderRestaurantList() {
    const cityContainer = document.getElementById('food-city-pills');
    const tripWrap = document.getElementById('food-trip-filter-wrap');
    const tripContainer = document.getElementById('food-trip-pills');
    const cuisineContainer = document.getElementById('food-cuisine-filter-pills');
    const ul = document.getElementById('food-ul');
    if (!cityContainer || !ul) return;

    const modeList = activeSpotMode === 'all'
        ? restaurants
        : restaurants.filter(r => (r.spotType || 'dining') === activeSpotMode);

    const cities = [...new Set(modeList.map(r => r.city).filter(Boolean))];
    let cityHtml = `<label class="chip ${activeFoodCity === 'all' ? 'active' : ''}"><input type="checkbox" switch class="ios-taptic" onchange="setFoodFilter('city', 'all')">🌍 All (${modeList.length})</label>`;
    cities.forEach(c => {
        const cnt = modeList.filter(r => r.city === c).length;
        const active = activeFoodCity === c ? 'active' : '';
        cityHtml += `<label class="chip ${active}"><input type="checkbox" switch class="ios-taptic" onchange="setFoodFilter('city', '${c.replace(/'/g, "\\'")}')">${c} (${cnt})</label>`;
    });
    cityContainer.innerHTML = cityHtml;

    const ideaTrips = (typeof ideas !== 'undefined' ? ideas : []).map(i => i.tripFolder).filter(Boolean);
    const trips = [...new Set([...modeList.map(r => r.tripFolder).filter(Boolean), ...ideaTrips])];
    if (trips.length > 0 && tripWrap && tripContainer) {
        tripWrap.style.display = 'block';
        tripContainer.innerHTML = trips.map(t => {
            const active = activeFoodTrip === t ? 'active' : '';
            const esc = t.replace(/'/g, "\\'");
            return `<label class="chip ${active}"><input type="checkbox" switch class="ios-taptic" onchange="if(typeof openTripDashboardModal==='function'){openTripDashboardModal('${esc}')}else{setFoodFilter('trip', '${esc}')}">✈️ ${t}</label>`;
        }).join('');
    } else if (tripWrap) {
        tripWrap.style.display = 'none';
    }

    const allCuisines = [...new Set([...customCuisines, ...modeList.map(r => r.cuisine).filter(Boolean)])];
    cuisineContainer.innerHTML = allCuisines.map(c => {
        const active = activeFoodCuisine === c ? 'active' : '';
        const esc = c.replace(/'/g, "\\'");
        return `<label class="chip ${active}"><input type="checkbox" switch class="ios-taptic" onchange="setFoodFilter('cuisine', '${esc}')">${c}</label>`;
    }).join('');

    const search = (document.getElementById('search-food')?.value || '').toLowerCase();
    const statusFilter = document.getElementById('filter-food-status')?.value || 'all';

    const filtered = modeList.filter(r => {
        if (activeFoodCity !== 'all' && r.city !== activeFoodCity) return false;
        if (activeFoodTrip !== 'all' && r.tripFolder !== activeFoodTrip) return false;
        if (activeFoodCuisine !== 'all' && r.cuisine !== activeFoodCuisine) return false;
        if (statusFilter === 'todo' && r.isVisited) return false;
        if (statusFilter === 'visited' && !r.isVisited) return false;
        return r.name.toLowerCase().includes(search) ||
            r.city.toLowerCase().includes(search) ||
            (r.neighborhood && r.neighborhood.toLowerCase().includes(search)) ||
            (r.tripFolder && r.tripFolder.toLowerCase().includes(search)) ||
            (r.mustOrder && r.mustOrder.toLowerCase().includes(search));
    });

    if (isFoodMapViewOpen) renderFoodMap(filtered);

    const TYPE_LABELS = { dining: '🍽️ Dining', cafe: '☕ Cafe/Pastry', cook: '👨‍🍳 Cook Together' };

    ul.innerHTML = filtered.map(r => {
        const mapsHref = r.mapsLink && r.mapsLink.startsWith('http')
            ? r.mapsLink
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name + ' ' + r.city)}`;
        const socialBtn = r.socialLink
            ? `<a href="${r.socialLink}" target="_blank" rel="noopener" class="badge" style="color:var(--accent);border-color:var(--accent);font-weight:700;">🎬 Watch Reel</a>`
            : '';
        const mapsBtn = r.spotType === 'cook' ? '' : `<a href="${mapsHref}" target="_blank" rel="noopener" class="badge">📍 Maps</a>`;

        let visitedBadge = '';
        if (r.isVisited) {
            const splitStr = formatPartnerRatings(r.joaoRating, r.jennaRating, r.rating);
            visitedBadge = `<span class="badge user-badge">✅ ${splitStr}</span>`;
        }

        const neighBadge = r.neighborhood ? `<span class="badge">🏘️ ${r.neighborhood}</span>` : '';
        const tripBadge = r.tripFolder ? `<span class="badge" style="border-color:#60a5fa;color:#60a5fa;cursor:pointer;" onclick="if(typeof openTripDashboardModal==='function') openTripDashboardModal('${r.tripFolder.replace(/'/g, "\\'")}')">✈️ ${r.tripFolder}</span>` : '';
        const typeBadge = `<span class="badge">${TYPE_LABELS[r.spotType] || '🍽️ Dining'}</span>`;

        const instagramUrl = getInstagramPermalink(r.socialLink || '');
        const thumbHtml = !instagramUrl && r.thumbnailUrl
            ? `<a href="${r.socialLink || mapsHref}" target="_blank" rel="noopener" class="spot-thumb-link">
                <img src="${r.thumbnailUrl}" class="spot-thumb-img" alt="${r.name}" loading="lazy">
                <span class="spot-thumb-play">▶ Reel</span>
               </a>`
            : '';
        const instagramEmbedHtml = instagramUrl ? instagramEmbedMarkup(instagramUrl) : '';

        const photoHtml = (r.isVisited && r.photoData)
            ? `<img src="${r.photoData}" class="memory-photo-img" alt="Visit memory" loading="lazy">`
            : '';

        return `
            <li class="idea-item">
                <div class="spot-card-flex">
                    ${thumbHtml}
                    <div style="flex: 1; min-width: 0;">
                        <div class="idea-item-header">
                            <div class="idea-item-title" style="${r.isVisited ? 'opacity:0.75;' : ''}">
                                ${r.name} <span style="font-weight:500;opacity:0.75;font-size:12px;">• ${r.city}</span>
                            </div>
                            <div class="action-bar">
                                <button class="action-btn action-btn-complete ${r.isVisited ? 'is-complete' : ''}" onclick="markRestaurantVisited(${r.id})" title="${r.isVisited ? 'Edit visit memory' : 'Mark spot visited'}" aria-label="${r.isVisited ? 'Edit visit memory' : 'Mark spot visited'}">${r.isVisited ? '💝' : '<svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>'}</button>
                                <button class="action-btn action-btn-edit" onclick="editRestaurant(${r.id})" title="Edit spot" aria-label="Edit spot"><svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l4.5-1 10.2-10.2a2.1 2.1 0 0 0-3-3L5.5 16 4 20Z"/></svg></button>
                                <button class="action-btn action-btn-delete" onclick="deleteRestaurant(${r.id})" title="Delete spot" aria-label="Delete spot"><svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3"/></svg></button>
                            </div>
                        </div>
                        ${instagramEmbedHtml}
                        ${r.mustOrder ? `<div style="font-size: 12.5px; opacity: 0.88; margin-top: 3px;">💡 <b>${r.spotType === 'cook' ? 'Ingredients/Notes:' : 'Order/Note:'}</b> ${linkify(r.mustOrder)}</div>` : ''}
                        ${r.isVisited && r.review ? `<div class="memory-quote">“${linkify(r.review)}”</div>` : ''}
                        ${photoHtml}
                        <div class="badges" style="margin-top: 6px;">
                            ${visitedBadge}
                            ${tripBadge}
                            ${neighBadge}
                            ${typeBadge}
                            <span class="badge">${r.cuisine}</span>
                            <span class="badge">${r.vibe}</span>
                            <span class="badge">${r.price}</span>
                            ${socialBtn}
                            ${mapsBtn}
                        </div>
                    </div>
                </div>
            </li>
        `;
    }).join('') || `<li class="idea-item" style="text-align:center;opacity:0.7;">No spots match this filter yet! Tap ➕ Add Spot above.</li>`;
    if (filtered.some(r => getInstagramPermalink(r.socialLink || ''))) processInstagramEmbeds();
}

async function pickRandomRestaurant() {
    requestDeviceMotionAccess();
    triggerHaptic(15);
    const pool = restaurants.filter(r => {
        if (activeSpotMode !== 'all' && (r.spotType || 'dining') !== activeSpotMode) return false;
        if (r.isVisited) return false;
        if (activeFoodCity !== 'all' && r.city !== activeFoodCity) return false;
        if (activeFoodTrip !== 'all' && r.tripFolder !== activeFoodTrip) return false;
        if (activeFoodCuisine !== 'all' && r.cuisine !== activeFoodCuisine) return false;
        return true;
    });
    if (pool.length === 0) return showToast("No unvisited spots match your current filter!", true);

    const winner = pool[Math.floor(Math.random() * pool.length)];
    const titleEl = document.getElementById('winner-text');
    const descEl = document.getElementById('winner-description');
    const headerEl = document.getElementById('winner-header-label');
    const rerollBtn = document.getElementById('winner-reroll-btn');
    const pinBtn = document.getElementById('winner-pin-btn');

    document.getElementById('result-overlay').style.display = 'flex';
    rerollBtn.onclick = pickRandomRestaurant;
    pinBtn.innerText = '📍 Open in Maps';
    pinBtn.onclick = () => {
        const mapsHref = winner.mapsLink && winner.mapsLink.startsWith('http')
            ? winner.mapsLink
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(winner.name + ' ' + winner.city)}`;
        window.open(mapsHref, '_blank');
    };

    headerEl.innerText = `🍽️ Rolling ${activeFoodCity === 'all' ? 'All Spots' : activeFoodCity}...`;
    descEl.style.display = 'none';
    for (const delay of [60, 80, 110, 145, 190]) {
        const sample = pool[Math.floor(Math.random() * pool.length)];
        titleEl.innerText = `${sample.name} (${sample.city})`;
        await new Promise(r => setTimeout(r, delay));
    }

    headerEl.innerText = `🎉 Winner in ${winner.city}!`;
    titleEl.innerText = winner.name;
    descEl.innerHTML = `${winner.cuisine} • ${winner.vibe} (${winner.price})<br>${winner.mustOrder ? `💡 <b>Must order:</b> ${linkify(winner.mustOrder)}` : ''}`;
    descEl.style.display = 'block';
    triggerConfetti();
}
let foodLeafletMap = null;
let foodMapMarkers = [];

function toggleFoodMapView() {
    triggerHaptic(10);
    isFoodMapViewOpen = !isFoodMapViewOpen;
    const wrap = document.getElementById('food-map-wrap');
    const btn = document.getElementById('btn-toggle-map');
    if (wrap) wrap.style.display = isFoodMapViewOpen ? 'block' : 'none';
    if (btn) {
        const label = btn.querySelector('span');
        if (label) label.innerText = isFoodMapViewOpen ? 'List' : 'Map';
        btn.setAttribute('aria-pressed', String(isFoodMapViewOpen));
        btn.title = isFoodMapViewOpen ? 'Show spots as a list' : 'Show spots on the map';
        btn.style.borderColor = isFoodMapViewOpen ? 'var(--accent)' : '';
        btn.style.color = isFoodMapViewOpen ? 'var(--accent)' : '';
    }
    if (isFoodMapViewOpen) renderFoodMap();
}

function renderFoodMap(filteredSpots) {
    if (!isFoodMapViewOpen || typeof L === 'undefined') return;
    const list = filteredSpots || restaurants;
    if (!foodLeafletMap) {
        foodLeafletMap = L.map('food-leaflet-map').setView([38.7223, -9.1393], 4);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(foodLeafletMap);
    }
    setTimeout(() => foodLeafletMap.invalidateSize(), 150);

    foodMapMarkers.forEach(m => foodLeafletMap.removeLayer(m));
    foodMapMarkers = [];

    const bounds = [];
    list.forEach(r => {
        if (r.mapCoordinateSource !== 'google-place-pin' && r.mapCoordinateSource !== 'stored') return;
        if (r.lat === null || r.lat === undefined || r.lat === '' || r.lng === null || r.lng === undefined || r.lng === '') return;
        const lat = Number(r.lat);
        const lng = Number(r.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
        const mapsHref = r.mapsLink && r.mapsLink.startsWith('http')
            ? r.mapsLink
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name + ' ' + r.city)}`;
        const marker = L.circleMarker([lat, lng], {
            radius: 8,
            fillColor: r.isVisited ? '#10b981' : '#cba6f7',
            color: '#1e1e2e',
            weight: 2,
            fillOpacity: 0.95
        }).addTo(foodLeafletMap);

        marker.bindPopup(`
            <div style="font-size:12.5px;line-height:1.4;">
                <b>${r.name}</b> ${r.neighborhood ? `<span style="opacity:0.7;">(${r.neighborhood})</span>` : ''}<br>
                <span>${r.cuisine} • ${r.price}</span><br>
                ${r.mustOrder ? `<span style="font-size:11px;opacity:0.85;">💡 ${r.mustOrder}</span><br>` : ''}
                <a href="${mapsHref}" target="_blank" style="color:var(--accent);font-weight:700;text-decoration:none;">📍 Open in Google Maps →</a>
            </div>
        `);
        foodMapMarkers.push(marker);
        bounds.push([lat, lng]);
    });

    if (bounds.length > 0) {
        foodLeafletMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    }
}

// RestorAny - Main Application JavaScript

// API Base URL
const API_BASE = '/api';

// Default locations
const LOCATIONS = {
    varazdin: { lat: 46.3044, lng: 16.3366, name: 'Varaždin' },
    zagreb: { lat: 45.8150, lng: 15.9819, name: 'Zagreb' }
};

// App State
const state = {
    currentLocation: LOCATIONS.varazdin,
    currentUser: null,
    selectedRestaurant: null,
    restaurants: [],
    radius: 10,
    isPickingLocation: false,
    pickingMode: null, // 'restaurant' or 'user-location'
    markers: [],
    map: null,
    userMarker: null
};

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initEventListeners();
    loadUsers();
    loadRestaurants();
});

function initMap() {
    state.map = L.map('map').setView([state.currentLocation.lat, state.currentLocation.lng], 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(state.map);
    
    updateUserMarker();
    
    state.map.on('click', handleMapClick);
}

function updateUserMarker() {
    if (state.userMarker) {
        state.map.removeLayer(state.userMarker);
    }
    
    const userIcon = L.divIcon({
        className: 'user-marker',
        html: '<div style="background: #457b9d; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });
    
    state.userMarker = L.marker([state.currentLocation.lat, state.currentLocation.lng], { icon: userIcon })
        .addTo(state.map)
        .bindPopup(`<b>Vaša lokacija</b><br>${state.currentLocation.name || 'Trenutna lokacija'}`);
}

function handleMapClick(e) {
    if (state.isPickingLocation) {
        const { lat, lng } = e.latlng;
        
        if (state.pickingMode === 'user-location') {
            // Set user location
            state.currentLocation = {
                lat: lat,
                lng: lng,
                name: 'Odabrana lokacija'
            };
            toggleLocationPicking(false);
            updateLocationAndReload();
            return;
        }
        
        // Restaurant location picking
        document.getElementById('new-lat').value = lat;
        document.getElementById('new-lng').value = lng;
        
        // Show temporary marker
        if (state.tempMarker) {
            state.map.removeLayer(state.tempMarker);
        }
        
        const tempIcon = L.divIcon({
            className: 'temp-marker',
            html: '<div style="background: #28a745; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-size: 18px;">+</div>',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });
        
        state.tempMarker = L.marker([lat, lng], { icon: tempIcon }).addTo(state.map);
        
        showToast('Lokacija odabrana! Ispunite ostale podatke.', 'success');
    }
}

function addRestaurantMarkers(restaurants) {
    // Clear existing markers
    state.markers.forEach(marker => state.map.removeLayer(marker));
    state.markers = [];
    
    restaurants.forEach(restaurant => {
        if (restaurant.latitude && restaurant.longitude) {
            const rating = parseFloat(restaurant.ocjena) || 0;
            const color = rating >= 4 ? '#28a745' : rating >= 3 ? '#ffc107' : '#e63946';
            
            const icon = L.divIcon({
                className: 'restaurant-marker',
                html: `<div style="background: ${color}; width: 35px; height: 35px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px;">${rating.toFixed(1)}</div>`,
                iconSize: [35, 35],
                iconAnchor: [17, 17]
            });
            
            const marker = L.marker([restaurant.latitude, restaurant.longitude], { icon })
                .addTo(state.map)
                .bindPopup(`
                    <div class="popup-content">
                        <div class="popup-title">${restaurant.naziv}</div>
                        <div class="popup-rating">★ ${rating.toFixed(1)} (${restaurant.broj_recenzija || 0} recenzija)</div>
                        <div class="popup-address">${restaurant.adresa || 'Adresa nije dostupna'}</div>
                    </div>
                `);
            
            marker.on('click', () => {
                selectRestaurant(restaurant.id);
            });
            
            state.markers.push(marker);
        }
    });
}

function centerMapOnLocation(lat, lng, zoom = 13) {
    state.map.setView([lat, lng], zoom);
}

// ============================================
// API FUNCTIONS
// ============================================

async function fetchAPI(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'API Error');
        }
        
        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

async function loadUsers() {
    try {
        const users = await fetchAPI('/users');
        const select = document.getElementById('current-user');
        select.innerHTML = users.map(user => 
            `<option value="${user.id}">${user.username}</option>`
        ).join('');
        
        if (users.length > 0) {
            state.currentUser = users[0];
        }
    } catch (error) {
        showToast('Greška pri učitavanju korisnika', 'error');
    }
}

async function loadRestaurants() {
    try {
        const params = new URLSearchParams({
            lat: state.currentLocation.lat,
            lng: state.currentLocation.lng,
            radius: state.radius
        });
        
        const restaurants = await fetchAPI(`/restaurants?${params}`);
        state.restaurants = restaurants;
        addRestaurantMarkers(restaurants);
        displaySearchResults(restaurants);
    } catch (error) {
        showToast('Greška pri učitavanju restorana', 'error');
    }
}

async function searchRestaurants(query) {
    try {
        const params = new URLSearchParams({
            q: query,
            lat: state.currentLocation.lat,
            lng: state.currentLocation.lng
        });
        
        const restaurants = await fetchAPI(`/restaurants/search?${params}`);
        state.restaurants = restaurants;
        addRestaurantMarkers(restaurants);
        displaySearchResults(restaurants);
    } catch (error) {
        showToast('Greška pri pretraživanju', 'error');
    }
}

async function selectRestaurant(id) {
    try {
        const params = new URLSearchParams({
            lat: state.currentLocation.lat,
            lng: state.currentLocation.lng
        });
        
        const restaurant = await fetchAPI(`/restaurants/${id}?${params}`);
        state.selectedRestaurant = restaurant;
        
        const reviewsData = await fetchAPI(`/reviews/restaurant/${id}`);
        
        displayRestaurantDetails(restaurant, reviewsData.reviews);
        
        document.getElementById('right-sidebar').classList.add('active');
        
        if (restaurant.latitude && restaurant.longitude) {
            centerMapOnLocation(restaurant.latitude, restaurant.longitude, 15);
        }
    } catch (error) {
        showToast('Greška pri učitavanju restorana', 'error');
    }
}

async function addRestaurant(formData) {
    try {
        const response = await fetch(`${API_BASE}/restaurants`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'API Error');
        }
        
        showToast('Restoran uspješno dodan!', 'success');
        loadRestaurants();
        
        // Reset form
        document.getElementById('add-restaurant-form').reset();
        document.getElementById('file-name').textContent = 'Nije odabrana slika';
        if (state.tempMarker) {
            state.map.removeLayer(state.tempMarker);
            state.tempMarker = null;
        }
        
        // Exit location picking mode
        toggleLocationPicking(false);
        
        return data;
    } catch (error) {
        showToast(error.message || 'Greška pri dodavanju restorana', 'error');
    }
}

async function addReview(data) {
    try {
        await fetchAPI('/reviews', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        
        showToast('Recenzija uspješno dodana!', 'success');
        
        if (state.selectedRestaurant) {
            selectRestaurant(state.selectedRestaurant.id);
        }
        
        loadRestaurants();
        
        closeModal('review-modal');
    } catch (error) {
        showToast(error.message || 'Greška pri dodavanju recenzije', 'error');
    }
}

async function addVisit(data) {
    try {
        await fetchAPI('/visits', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        
        showToast('Posjet uspješno zabilježen!', 'success');
        closeModal('visit-modal');
    } catch (error) {
        showToast(error.message || 'Greška pri bilježenju posjeta', 'error');
    }
}

async function loadMyReviews() {
    if (!state.currentUser) return;
    
    try {
        const reviews = await fetchAPI(`/reviews/user/${state.currentUser.id}`);
        displayMyReviews(reviews);
    } catch (error) {
        showToast('Greška pri učitavanju recenzija', 'error');
    }
}

async function loadMyVisits() {
    if (!state.currentUser) return;
    
    try {
        const [visits, stats] = await Promise.all([
            fetchAPI(`/visits/user/${state.currentUser.id}`),
            fetchAPI(`/visits/user/${state.currentUser.id}/stats`)
        ]);
        displayMyVisits(visits, stats);
    } catch (error) {
        showToast('Greška pri učitavanju posjeta', 'error');
    }
}

// ============================================
// DISPLAY FUNCTIONS
// ============================================

function displaySearchResults(restaurants) {
    const container = document.getElementById('search-results');
    
    if (restaurants.length === 0) {
        container.innerHTML = '<p class="empty-state">Nema rezultata pretrage</p>';
        return;
    }
    
    container.innerHTML = restaurants.map(r => `
        <div class="search-result-item" data-id="${r.id}">
            <h4>${r.naziv}</h4>
            <p class="address">${r.adresa || 'Adresa nije dostupna'}</p>
            <div class="meta">
                <span class="rating">★ ${parseFloat(r.ocjena || 0).toFixed(1)} (${r.broj_recenzija || 0})</span>
                ${r.udaljenost_km ? `<span class="distance">${r.udaljenost_km.toFixed(1)} km</span>` : ''}
            </div>
        </div>
    `).join('');
    
    // Add click handlers
    container.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
            selectRestaurant(item.dataset.id);
        });
    });
}

function displayRestaurantDetails(restaurant, reviews) {
    const container = document.getElementById('restaurant-details');
    const rating = parseFloat(restaurant.ocjena) || 0;
    const details = restaurant.restoran_detalji || {};
    const hours = restaurant.radno_vrijeme || {};
    
    container.innerHTML = `
        <div class="restaurant-header">
            <h2>${restaurant.naziv}</h2>
            <p class="address">${restaurant.adresa || 'Adresa nije dostupna'}</p>
            
            <div class="restaurant-rating">
                <span class="stars">${'★'.repeat(Math.round(rating))}${'☆'.repeat(5 - Math.round(rating))}</span>
                <span class="score">${rating.toFixed(1)}</span>
                <span class="count">(${restaurant.broj_recenzija || 0} recenzija)</span>
            </div>
            
            <div class="tags">
                ${details.kategorije ? details.kategorije.map(k => `<span class="tag">${k}</span>`).join('') : ''}
                ${details.cijena ? `<span class="tag price">${details.cijena}</span>` : ''}
            </div>
        </div>
        
        ${restaurant.slika_url ? `
            <div class="restaurant-image">
                <img src="${restaurant.slika_url}" alt="${restaurant.naziv}" onerror="this.parentElement.style.display='none'">
            </div>
        ` : ''}
        
        <div class="restaurant-actions">
            <button class="btn btn-primary" onclick="openReviewModal(${restaurant.id})">
                Dodaj recenziju
            </button>
            <button class="btn btn-secondary" onclick="openVisitModal(${restaurant.id})">
                Zabilježi posjet
            </button>
            ${restaurant.web_stranica ? `
                <button class="btn btn-outline" onclick="window.open('${restaurant.web_stranica}', '_blank')">
                    Web stranica
                </button>
            ` : ''}
            <button class="btn btn-success" onclick="openNavigation(${restaurant.latitude}, ${restaurant.longitude})">
                Navigacija
            </button>
        </div>
        
        <div class="restaurant-info">
            ${restaurant.broj_telefona ? `
                <div class="info-item">
                    <span class="icon">📞</span>
                    <div class="content">
                        <span class="label">Telefon</span>
                        <span class="value"><a href="tel:${restaurant.broj_telefona}">${restaurant.broj_telefona}</a></span>
                    </div>
                </div>
            ` : ''}
            
            ${restaurant.udaljenost_km ? `
                <div class="info-item">
                    <span class="icon">📍</span>
                    <div class="content">
                        <span class="label">Udaljenost</span>
                        <span class="value">${restaurant.udaljenost_km.toFixed(1)} km</span>
                    </div>
                </div>
            ` : ''}
            
            ${Object.keys(hours).length > 0 ? `
                <div class="info-item">
                    <span class="icon">🕐</span>
                    <div class="content">
                        <span class="label">Radno vrijeme</span>
                        <span class="value">${Object.entries(hours).map(([day, time]) => `${day}: ${time}`).join('<br>')}</span>
                    </div>
                </div>
            ` : ''}
            
            ${details.pogodnosti && details.pogodnosti.length > 0 ? `
                <div class="info-item">
                    <span class="icon">✨</span>
                    <div class="content">
                        <span class="label">Pogodnosti</span>
                        <span class="value">${details.pogodnosti.join(', ')}</span>
                    </div>
                </div>
            ` : ''}
            
            ${details.dostava && details.dostava.length > 0 ? `
                <div class="info-item">
                    <span class="icon">🛵</span>
                    <div class="content">
                        <span class="label">Dostava</span>
                        <span class="value">${details.dostava.join(', ')}</span>
                    </div>
                </div>
            ` : ''}
        </div>
        
        <div class="reviews-section">
            <h3>Recenzije (${reviews.length})</h3>
            ${reviews.length === 0 ? '<p>Nema recenzija. Budite prvi koji će ocijeniti ovaj restoran!</p>' : ''}
            ${reviews.map(review => `
                <div class="review-card">
                    <div class="review-header">
                        <span class="review-user">${review.username}</span>
                        <span class="review-date">${formatDate(review.created_at)}</span>
                    </div>
                    <div class="review-stars">
                        ${'★'.repeat(review.ukupna_ocjena)}${'☆'.repeat(5 - review.ukupna_ocjena)}
                    </div>
                    ${review.komentar ? `<p class="review-comment">${review.komentar}</p>` : ''}
                    ${review.ocjene_detalji && Object.keys(review.ocjene_detalji).length > 0 ? `
                        <div class="review-details">
                            ${Object.entries(review.ocjene_detalji).map(([key, value]) => `
                                <span class="review-detail-item">${formatDetailKey(key)}: <span>${value}</span></span>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            `).join('')}
        </div>
    `;
}

function displayMyReviews(reviews) {
    const container = document.getElementById('my-reviews-list');
    
    if (reviews.length === 0) {
        container.innerHTML = '<p class="empty-state">Nemate još recenzija</p>';
        return;
    }
    
    container.innerHTML = reviews.map(r => `
        <div class="my-review-item" data-restaurant-id="${r.restoran_id}">
            <h4>${r.restoran_naziv}</h4>
            <div class="review-stars">
                ${'★'.repeat(r.ukupna_ocjena)}${'☆'.repeat(5 - r.ukupna_ocjena)}
            </div>
            ${r.komentar ? `<p>${r.komentar.substring(0, 100)}${r.komentar.length > 100 ? '...' : ''}</p>` : ''}
            <span class="date">${formatDate(r.created_at)}</span>
        </div>
    `).join('');
    
    container.querySelectorAll('.my-review-item').forEach(item => {
        item.addEventListener('click', () => {
            selectRestaurant(item.dataset.restaurantId);
        });
    });
}

function displayMyVisits(visits, stats) {
    const statsContainer = document.getElementById('my-visits-stats');
    const listContainer = document.getElementById('my-visits-list');
    
    statsContainer.innerHTML = `
        <h4>Statistika posjeta</h4>
        <div class="stats-grid">
            <div class="stat-item">
                <div class="value">${stats.total_visits || 0}</div>
                <div class="label">Ukupno posjeta</div>
            </div>
            <div class="stat-item">
                <div class="value">${stats.unique_restaurants || 0}</div>
                <div class="label">Različitih restorana</div>
            </div>
        </div>
    `;
    
    if (visits.length === 0) {
        listContainer.innerHTML = '<p class="empty-state">Nemate još zabilježenih posjeta</p>';
        return;
    }
    
    listContainer.innerHTML = visits.map(v => `
        <div class="my-visit-item" data-restaurant-id="${v.restoran_id}">
            <h4>${v.restoran_naziv}</h4>
            <p>${v.adresa || ''}</p>
            <span class="date">${formatDate(v.vrijeme_posjeta)} • ${v.broj_osoba} osoba</span>
        </div>
    `).join('');
    
    listContainer.querySelectorAll('.my-visit-item').forEach(item => {
        item.addEventListener('click', () => {
            selectRestaurant(item.dataset.restaurantId);
        });
    });
}

// ============================================
// EVENT LISTENERS
// ============================================

function initEventListeners() {
    // Menu buttons
    document.querySelectorAll('.menu-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            handleMenuAction(action);
            
            // Update active state
            document.querySelectorAll('.menu-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
    
    // Location buttons
    document.querySelectorAll('.location-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            handleLocationChange(btn.dataset.city);
            
            document.querySelectorAll('.location-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
    
    // Radius slider
    document.getElementById('radius-slider').addEventListener('input', (e) => {
        state.radius = parseInt(e.target.value);
        document.getElementById('radius-value').textContent = state.radius;
    });
    
    document.getElementById('radius-slider').addEventListener('change', () => {
        loadRestaurants();
    });
    
    // Search
    document.getElementById('search-btn').addEventListener('click', () => {
        const query = document.getElementById('search-input').value.trim();
        if (query) {
            searchRestaurants(query);
        } else {
            loadRestaurants();
        }
    });
    
    document.getElementById('search-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('search-btn').click();
        }
    });
    
    // Filter and sort handlers
    document.getElementById('filter-rating').addEventListener('change', applyFilters);
    document.getElementById('filter-category').addEventListener('change', applyFilters);
    document.getElementById('sort-by').addEventListener('change', applyFilters);
    
    // Add restaurant form
    document.getElementById('add-restaurant-form').addEventListener('submit', handleAddRestaurant);
    
    // File input change handler
    document.getElementById('restaurant-image').addEventListener('change', (e) => {
        const file = e.target.files[0];
        const fileNameSpan = document.getElementById('file-name');
        if (file) {
            fileNameSpan.textContent = file.name;
        } else {
            fileNameSpan.textContent = 'Nije odabrana slika';
        }
    });
    
    // Close details button
    document.getElementById('close-details').addEventListener('click', () => {
        document.getElementById('right-sidebar').classList.remove('active');
        state.selectedRestaurant = null;
    });
    
    // Cancel location picking
    document.getElementById('cancel-location-pick').addEventListener('click', () => {
        toggleLocationPicking(false);
    });
    
    // User selection
    document.getElementById('current-user').addEventListener('change', (e) => {
        const userId = parseInt(e.target.value);
        state.currentUser = { id: userId };
        
        // Reload user-specific content if on those panels
        const activePanel = document.querySelector('.panel.active');
        if (activePanel.id === 'my-reviews-panel') {
            loadMyReviews();
        } else if (activePanel.id === 'my-visits-panel') {
            loadMyVisits();
        }
    });
    
    // Review form
    document.getElementById('review-form').addEventListener('submit', handleAddReview);
    
    // Star rating
    document.querySelectorAll('#star-rating .star').forEach(star => {
        star.addEventListener('click', () => {
            const value = parseInt(star.dataset.value);
            document.getElementById('rating-value').value = value;
            
            document.querySelectorAll('#star-rating .star').forEach((s, i) => {
                s.classList.toggle('active', i < value);
            });
        });
        
        star.addEventListener('mouseenter', () => {
            const value = parseInt(star.dataset.value);
            document.querySelectorAll('#star-rating .star').forEach((s, i) => {
                s.style.color = i < value ? '#ffc107' : '#dee2e6';
            });
        });
    });
    
    document.getElementById('star-rating').addEventListener('mouseleave', () => {
        const currentValue = parseInt(document.getElementById('rating-value').value) || 0;
        document.querySelectorAll('#star-rating .star').forEach((s, i) => {
            s.style.color = i < currentValue ? '#ffc107' : '#dee2e6';
        });
    });
    
    // Visit form
    document.getElementById('visit-form').addEventListener('submit', handleAddVisit);
    
    // Modal close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.modal').classList.remove('active');
        });
    });
    
    // Close modals on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
}

function handleMenuAction(action) {
    // Hide all panels
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    
    switch (action) {
        case 'change-location':
            document.getElementById('location-panel').classList.add('active');
            toggleLocationPicking(false);
            break;
        case 'add-restaurant':
            document.getElementById('add-restaurant-panel').classList.add('active');
            toggleLocationPicking(true, 'restaurant');
            break;
        case 'search-restaurant':
            document.getElementById('search-panel').classList.add('active');
            toggleLocationPicking(false);
            displaySearchResults(state.restaurants);
            break;
        case 'my-reviews':
            document.getElementById('my-reviews-panel').classList.add('active');
            toggleLocationPicking(false);
            loadMyReviews();
            break;
        case 'my-visits':
            document.getElementById('my-visits-panel').classList.add('active');
            toggleLocationPicking(false);
            loadMyVisits();
            break;
    }
}

function handleLocationChange(city) {
    if (city === 'pick-on-map') {
        toggleLocationPicking(true, 'user-location');
        return;
    }
    if (city === 'current') {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    state.currentLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                        name: 'Moja lokacija'
                    };
                    updateLocationAndReload();
                },
                (error) => {
                    showToast('Nije moguće dohvatiti vašu lokaciju', 'error');
                }
            );
        } else {
            showToast('Geolokacija nije podržana u vašem pregledniku', 'error');
        }
    } else {
        state.currentLocation = LOCATIONS[city];
        updateLocationAndReload();
    }
}

function updateLocationAndReload() {
    updateUserMarker();
    centerMapOnLocation(state.currentLocation.lat, state.currentLocation.lng);
    loadRestaurants();
    showToast(`Lokacija promijenjena: ${state.currentLocation.name}`, 'info');
}

function toggleLocationPicking(enable, mode = 'restaurant') {
    state.isPickingLocation = enable;
    state.pickingMode = enable ? mode : null;
    const overlay = document.getElementById('map-overlay');
    const overlayText = document.getElementById('map-overlay-text');
    
    if (enable) {
        overlay.classList.add('active');
        if (mode === 'user-location') {
            overlayText.textContent = 'Kliknite na kartu za odabir vaše lokacije';
        } else {
            overlayText.textContent = 'Kliknite za odabir lokacije novog restorana';
        }
    } else {
        overlay.classList.remove('active');
        if (state.tempMarker) {
            state.map.removeLayer(state.tempMarker);
            state.tempMarker = null;
        }
    }
}

async function handleAddRestaurant(e) {
    e.preventDefault();
    
    const form = e.target;
    const formDataRaw = new FormData(form);
    
    const lat = formDataRaw.get('latitude');
    const lng = formDataRaw.get('longitude');
    
    if (!lat || !lng) {
        showToast('Molimo odaberite lokaciju na karti', 'error');
        return;
    }
    
    // Collect amenities
    const pogodnosti = [];
    form.querySelectorAll('input[name="pogodnosti"]:checked').forEach(cb => {
        pogodnosti.push(cb.value);
    });
    
    // Collect categories
    const kategorije = formDataRaw.get('kategorije') 
        ? formDataRaw.get('kategorije').split(',').map(k => k.trim()).filter(k => k)
        : [];
    
    // Build FormData for multipart upload
    const formData = new FormData();
    formData.append('naziv', formDataRaw.get('naziv'));
    formData.append('adresa', formDataRaw.get('adresa') || '');
    formData.append('broj_telefona', formDataRaw.get('broj_telefona') || '');
    formData.append('web_stranica', formDataRaw.get('web_stranica') || '');
    formData.append('latitude', lat);
    formData.append('longitude', lng);
    formData.append('restoran_detalji', JSON.stringify({
        kategorije,
        cijena: formDataRaw.get('cijena'),
        pogodnosti
    }));
    
    // Add image if selected
    const imageFile = formDataRaw.get('slika');
    if (imageFile && imageFile.size > 0) {
        formData.append('slika', imageFile);
    }
    
    await addRestaurant(formData);
}

async function handleAddReview(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    
    const ukupnaOcjena = parseInt(formData.get('ukupna_ocjena'));
    if (!ukupnaOcjena) {
        showToast('Molimo odaberite ocjenu', 'error');
        return;
    }
    
    const ocjeneDetalji = {};
    ['hrana', 'usluga', 'ambijent', 'vrijednost_za_novac'].forEach(key => {
        const value = formData.get(key);
        if (value) {
            ocjeneDetalji[key] = parseInt(value);
        }
    });
    
    const data = {
        korisnik_id: state.currentUser.id,
        restoran_id: parseInt(formData.get('restoran_id')),
        ukupna_ocjena: ukupnaOcjena,
        komentar: formData.get('komentar'),
        ocjene_detalji: ocjeneDetalji
    };
    
    await addReview(data);
}

async function handleAddVisit(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    
    const data = {
        korisnik_id: state.currentUser.id,
        restoran_id: parseInt(formData.get('restoran_id')),
        broj_osoba: parseInt(formData.get('broj_osoba')) || 1,
        vrijeme_posjeta: formData.get('vrijeme_posjeta') || null
    };
    
    await addVisit(data);
}

function applyFilters() {
    const minRating = parseFloat(document.getElementById('filter-rating').value);
    const category = document.getElementById('filter-category').value;
    const sortBy = document.getElementById('sort-by').value;
    
    let filtered = [...state.restaurants];
    
    // Filter by rating
    if (minRating > 0) {
        filtered = filtered.filter(r => parseFloat(r.ocjena) >= minRating);
    }
    
    // Filter by category
    if (category) {
        filtered = filtered.filter(r => {
            const details = r.restoran_detalji || {};
            const kategorije = details.kategorije || [];
            return kategorije.some(k => k.toLowerCase().includes(category.toLowerCase()));
        });
    }
    
    // Sort
    switch (sortBy) {
        case 'distance':
            filtered.sort((a, b) => (a.udaljenost_km || 999) - (b.udaljenost_km || 999));
            break;
        case 'rating':
            filtered.sort((a, b) => parseFloat(b.ocjena || 0) - parseFloat(a.ocjena || 0));
            break;
        case 'reviews':
            filtered.sort((a, b) => (b.broj_recenzija || 0) - (a.broj_recenzija || 0));
            break;
    }
    
    displaySearchResults(filtered);
    addRestaurantMarkers(filtered);
}

function openReviewModal(restaurantId) {
    document.getElementById('review-restaurant-id').value = restaurantId;
    document.getElementById('rating-value').value = '';
    document.querySelectorAll('#star-rating .star').forEach(s => s.classList.remove('active'));
    document.getElementById('review-form').reset();
    document.getElementById('review-modal').classList.add('active');
}

function openVisitModal(restaurantId) {
    document.getElementById('visit-restaurant-id').value = restaurantId;
    document.getElementById('visit-form').reset();
    
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.querySelector('#visit-form input[name="vrijeme_posjeta"]').value = now.toISOString().slice(0, 16);
    
    document.getElementById('visit-modal').classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function openNavigation(lat, lng) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    window.open(url, '_blank');
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('hr-HR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

function formatDetailKey(key) {
    const translations = {
        'hrana': 'Hrana',
        'usluga': 'Usluga',
        'ambijent': 'Ambijent',
        'vrijednost_za_novac': 'Vrijednost za novac',
        'cekano_minuta': 'Čekano (min)'
    };
    return translations[key] || key;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

window.openReviewModal = openReviewModal;
window.openVisitModal = openVisitModal;
window.openNavigation = openNavigation;

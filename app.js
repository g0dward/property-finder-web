/**
 * Property Finder — Frontend
 * Reads data.json and renders area rankings + listings.
 * Preferences (dismissed listings, area boosts/hides) persisted in localStorage.
 */

let DATA = null;
let sortBy = 'score';
let viewMode = 'listings';
let showDismissed = false;
let insaneMode = false;

// Preference state — loaded from localStorage
let dismissedListings = new Set();  // listing IDs
let areaPrefs = {};                 // { "Wood Green": "hidden", "Crouch End": "boosted" }
let activeAreas = new Set();        // selected area chips
let allAreaNames = new Set();       // all known area names
let filterMode = 'all';            // 'all' = show everything, 'selected' = show only activeAreas

// ── localStorage helpers ──

function loadPrefs() {
    try {
        const d = localStorage.getItem('pf_dismissed');
        if (d) dismissedListings = new Set(JSON.parse(d));

        const a = localStorage.getItem('pf_area_prefs');
        if (a) areaPrefs = JSON.parse(a);
    } catch (e) { /* ignore corrupt data */ }
}

function savePrefs() {
    localStorage.setItem('pf_dismissed', JSON.stringify([...dismissedListings]));
    localStorage.setItem('pf_area_prefs', JSON.stringify(areaPrefs));
}

// ── Init ──

async function init() {
    try {
        const resp = await fetch('data.json');
        DATA = await resp.json();
    } catch (e) {
        document.getElementById('content').innerHTML = `
            <div class="empty-state">
                <h2>No data yet</h2>
                <p>Run <code>python3 generate_web.py</code> to generate data.json</p>
            </div>`;
        return;
    }

    loadPrefs();

    // Start with ALL areas active (show everything), but keep hidden prefs
    // The chips will appear light/unselected — "active" here means "showing listings"
    allAreaNames = new Set();
    DATA.areas.forEach(a => allAreaNames.add(a.name));
    DATA.listings.forEach(l => { if (l.area_name) allAreaNames.add(l.area_name); });

    // On first load, show everything (no filtering)
    filterMode = 'all'; // 'all' = show everything, 'selected' = show only activeAreas
    activeAreas = new Set(); // empty = no specific selection yet

    updateStats();
    renderAreaFilters();
    bindEvents();
    render();
}

// ── Stats ──

function updateStats() {
    const visible = getVisibleListings().length;
    document.getElementById('total-areas').textContent = DATA.areas.length;
    document.getElementById('total-listings').textContent = visible;

    const date = new Date(DATA.generated_at);
    document.getElementById('last-updated').textContent = date.toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
}

// ── Area filter chips ──

function renderAreaFilters() {
    const container = document.getElementById('region-filters');

    // Group areas by region
    const regionAreas = {};
    DATA.region_order.forEach(r => regionAreas[r] = []);

    // Collect unique area names from both areas and listings
    const allAreaNames = new Set();
    DATA.areas.forEach(a => {
        allAreaNames.add(a.name);
        if (regionAreas[a.region]) regionAreas[a.region].push(a.name);
    });

    // Count listings per area
    const areaCounts = {};
    DATA.listings.forEach(l => {
        if (l.area_name) areaCounts[l.area_name] = (areaCounts[l.area_name] || 0) + 1;
    });

    let html = '';

    for (const region of DATA.region_order) {
        const areas = regionAreas[region] || [];
        if (areas.length === 0) continue;

        // Region-level count
        const regionCount = areas.reduce((sum, name) => sum + (areaCounts[name] || 0), 0);
        const allSelected = areas.every(name => activeAreas.has(name));
        const someSelected = areas.some(name => activeAreas.has(name));

        html += `<div class="filter-region">`;
        html += `<button class="chip chip-region ${filterMode === 'all' || allSelected ? '' : someSelected ? 'partial' : ''} ${filterMode === 'all' || allSelected ? '' : ''}" data-region="${region}">
            ${region}<span class="count">${regionCount}</span>
        </button>`;

        for (const name of areas) {
            const count = areaCounts[name] || 0;
            const isActive = filterMode === 'all' || activeAreas.has(name);
            const isSelected = activeAreas.has(name);
            const pref = areaPrefs[name];

            let prefClass = '';
            if (pref === 'boosted') prefClass = 'chip-boosted';
            else if (pref === 'hidden') prefClass = 'chip-hidden';

            html += `<button class="chip chip-area ${isSelected ? 'active' : ''} ${prefClass}" data-area="${name}">
                ${name}<span class="count">${count}</span>
            </button>`;
        }

        html += `</div>`;
    }

    // Dismissed toggle
    const dismissedCount = dismissedListings.size;
    if (dismissedCount > 0) {
        html += `<div class="filter-region">
            <button class="chip chip-dismissed ${showDismissed ? 'active' : ''}" id="toggle-dismissed">
                Dismissed<span class="count">${dismissedCount}</span>
            </button>
        </div>`;
    }

    container.innerHTML = html;
}

// ── Events ──

function bindEvents() {
    const filterContainer = document.getElementById('region-filters');

    filterContainer.addEventListener('click', e => {
        const chip = e.target.closest('.chip');
        if (!chip) return;

        // Dismissed toggle
        if (chip.id === 'toggle-dismissed') {
            showDismissed = !showDismissed;
            renderAreaFilters();
            render();
            return;
        }

        // Region chip — select all areas in that region (or clear if all already selected)
        if (chip.dataset.region) {
            const region = chip.dataset.region;
            const regionAreaNames = DATA.areas.filter(a => a.region === region).map(a => a.name);
            const allSelected = regionAreaNames.every(name => activeAreas.has(name));

            if (filterMode === 'all') {
                // First click from "show all" mode — select just this region
                filterMode = 'selected';
                activeAreas = new Set(regionAreaNames);
            } else if (allSelected) {
                // All in region selected — deselect them
                regionAreaNames.forEach(name => activeAreas.delete(name));
                if (activeAreas.size === 0) filterMode = 'all';
            } else {
                // Add all in region
                regionAreaNames.forEach(name => activeAreas.add(name));
            }

            renderAreaFilters();
            render();
            return;
        }

        // Area chip — additive selection
        if (chip.dataset.area) {
            const name = chip.dataset.area;

            if (filterMode === 'all') {
                // First click from "show all" — select just this one
                filterMode = 'selected';
                activeAreas = new Set([name]);
            } else if (activeAreas.has(name)) {
                // Deselect this one
                activeAreas.delete(name);
                if (activeAreas.size === 0) filterMode = 'all';
            } else {
                // Add this one
                activeAreas.add(name);
            }

            renderAreaFilters();
            render();
            return;
        }
    });

    // Right-click on area chip for boost/hide menu
    filterContainer.addEventListener('contextmenu', e => {
        const chip = e.target.closest('.chip-area');
        if (!chip) return;
        e.preventDefault();

        const name = chip.dataset.area;
        const current = areaPrefs[name];

        // Cycle: default → boosted → hidden → default
        if (!current) {
            areaPrefs[name] = 'boosted';
            activeAreas.add(name);
        } else if (current === 'boosted') {
            areaPrefs[name] = 'hidden';
            activeAreas.delete(name);
        } else {
            delete areaPrefs[name];
            activeAreas.add(name);
        }

        savePrefs();
        renderAreaFilters();
        updateStats();
        render();
    });

    document.getElementById('sort-by').addEventListener('change', e => {
        sortBy = e.target.value;
        render();
    });

    document.getElementById('insane-mode').addEventListener('click', e => {
        insaneMode = !insaneMode;
        e.target.classList.toggle('active', insaneMode);
        e.target.textContent = insaneMode ? 'Insane Mode ON' : 'Insane Mode';
        render();
    });

    document.getElementById('view-tabs').addEventListener('click', e => {
        const tab = e.target.closest('.tab');
        if (!tab) return;
        viewMode = tab.dataset.view;
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderAreaFilters();
        render();
    });

    // Delegate dismiss button clicks on listing cards
    document.getElementById('content').addEventListener('click', e => {
        // Slideshow navigation
        const slideBtn = e.target.closest('.slide-btn');
        if (slideBtn) {
            e.preventDefault();
            e.stopPropagation();
            const slideshow = slideBtn.closest('.card-slideshow');
            const card = slideBtn.closest('.listing-card-v2-wrap');
            const listingId = card?.querySelector('.card-dismiss')?.dataset.id;
            const listing = DATA.listings.find(l => l.id === listingId);
            if (!listing || !listing.image_urls) return;

            const images = listing.image_urls;
            let idx = parseInt(slideshow.dataset.idx || '0');
            if (slideBtn.classList.contains('slide-next')) {
                idx = (idx + 1) % images.length;
            } else {
                idx = (idx - 1 + images.length) % images.length;
            }
            slideshow.dataset.idx = idx;
            slideshow.querySelector('.card-image').src = images[idx];
            slideshow.querySelectorAll('.slide-dot').forEach((dot, i) => {
                dot.classList.toggle('active', i === idx);
            });
            return;
        }

        const dismissBtn = e.target.closest('.card-dismiss');
        if (!dismissBtn) return;
        e.preventDefault();
        e.stopPropagation();

        const id = dismissBtn.dataset.id;
        if (showDismissed && dismissedListings.has(id)) {
            // Restore
            dismissedListings.delete(id);
        } else {
            dismissedListings.add(id);
        }

        savePrefs();
        updateStats();
        renderAreaFilters();
        render();
    });
}

// ── Helpers ──

function getScoreClass(score) {
    if (score >= 0.65) return 'high';
    if (score >= 0.45) return 'mid';
    return 'low';
}

function getScoreTextClass(score) {
    if (score >= 0.65) return 'score-high';
    if (score >= 0.45) return 'score-mid';
    return 'score-low';
}

function formatPrice(price) {
    if (!price) return '–';
    return '£' + price.toLocaleString('en-GB');
}

function formatMonthly(amount) {
    if (!amount) return '–';
    return '£' + Math.round(amount).toLocaleString('en-GB') + '/mo';
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function getAreaCommute(areaName) {
    const area = DATA.areas.find(a => a.name === areaName);
    return area ? area.commute_minutes : 999;
}

function getAreaScores(areaName) {
    const area = DATA.areas.find(a => a.name === areaName);
    return area ? area.scores : null;
}

function isAreaVisible(areaName) {
    if (areaPrefs[areaName] === 'hidden') return false;
    if (filterMode === 'all') return true;
    return activeAreas.has(areaName);
}

function getVisibleListings() {
    const maxPrice = insaneMode ? 750000 : 700000;
    return DATA.listings.filter(l => {
        if (!isAreaVisible(l.area_name)) return false;
        if (!showDismissed && dismissedListings.has(l.id)) return false;
        if (l.price && l.price > maxPrice) return false;
        return true;
    });
}

// ── Sorting ──

function sortAreas(areas) {
    const sorted = [...areas];
    switch (sortBy) {
        case 'commute':
            sorted.sort((a, b) => (a.commute_minutes || 999) - (b.commute_minutes || 999));
            break;
        case 'price-asc':
            sorted.sort((a, b) => (a.avg_price || 0) - (b.avg_price || 0));
            break;
        case 'price-desc':
            sorted.sort((a, b) => (b.avg_price || 0) - (a.avg_price || 0));
            break;
        default:
            sorted.sort((a, b) => {
                const aBoost = areaPrefs[a.name] === 'boosted' ? 0.2 : 0;
                const bBoost = areaPrefs[b.name] === 'boosted' ? 0.2 : 0;
                return (b.total_score + bBoost) - (a.total_score + aBoost);
            });
    }
    return sorted;
}

function sortListings(listings) {
    const sorted = [...listings];
    switch (sortBy) {
        case 'commute':
            sorted.sort((a, b) => getAreaCommute(a.area_name) - getAreaCommute(b.area_name));
            break;
        case 'price-asc':
            sorted.sort((a, b) => (a.price || 0) - (b.price || 0));
            break;
        case 'price-desc':
            sorted.sort((a, b) => (b.price || 0) - (a.price || 0));
            break;
        case 'value':
            sorted.sort((a, b) => (a.vs_median_pct ?? 999) - (b.vs_median_pct ?? 999));
            break;
        default:
            sorted.sort((a, b) => {
                const aBoost = areaPrefs[a.area_name] === 'boosted' ? 0.2 : 0;
                const bBoost = areaPrefs[b.area_name] === 'boosted' ? 0.2 : 0;
                return ((b.listing_score || 0) + bBoost) - ((a.listing_score || 0) + aBoost);
            });
    }
    return sorted;
}

// ── Render helpers ──

function renderScoreBar(score) {
    const cls = getScoreClass(score);
    const pct = Math.round(score * 100);
    return `<div class="score-bar-container">
        <div class="score-bar"><div class="score-bar-fill ${cls}" style="width:${pct}%"></div></div>
        <span class="score-value ${getScoreTextClass(score)}">${score.toFixed(2)}</span>
    </div>`;
}

function renderScoreBreakdown(scores) {
    const labels = {
        commute_time: 'Commute',
        commute_cost: 'Train cost',
        crime_safety: 'Safety',
        green_space: 'Green space',
        walkability: 'Walkability',
        broadband: 'Broadband',
        budget_fit: 'Budget fit',
    };

    const rows = Object.entries(labels).map(([key, label]) => {
        const val = scores[key] || 0;
        return `<div class="tooltip-row">
            <span class="tooltip-label">${label}</span>
            <span class="tooltip-value ${getScoreTextClass(val)}">${val.toFixed(2)}</span>
        </div>`;
    }).join('');

    return `<div class="tooltip">${rows}</div>`;
}

// ── Area table ──

function renderAreaTable(areas) {
    if (areas.length === 0) {
        return '<div class="empty-state"><p>No areas match your filters</p></div>';
    }

    const allSorted = sortAreas(DATA.areas);
    const rankMap = {};
    allSorted.forEach((a, i) => rankMap[a.name] = i + 1);

    const grouped = {};
    DATA.region_order.forEach(r => {
        const regionAreas = areas.filter(a => a.region === r && isAreaVisible(a.name));
        if (regionAreas.length > 0) grouped[r] = sortAreas(regionAreas);
    });

    let html = '';

    for (const region of DATA.region_order) {
        if (!grouped[region]) continue;

        html += `<div class="region-section">
            <div class="region-header">
                <span class="region-name">${region}</span>
                <span class="region-count">${grouped[region].length} areas</span>
            </div>
            <table class="area-table">
                <thead><tr>
                    <th style="width:36px">#</th><th>Area</th><th>Score</th>
                    <th class="num">Commute</th><th class="num">Avg 2-bed</th>
                    <th class="num">Mortgage</th><th class="num">+ Train</th><th>Type</th>
                </tr></thead><tbody>`;

        for (const area of grouped[region]) {
            const rank = rankMap[area.name] || '–';
            const pref = areaPrefs[area.name];
            const prefIcon = pref === 'boosted' ? ' ★' : pref === 'hidden' ? ' ✕' : '';
            const typeBadge = area.area_type === 'london'
                ? '<span class="badge badge-london">London</span>'
                : '<span class="badge badge-commuter">Commuter</span>';

            html += `<tr class="${pref === 'boosted' ? 'row-boosted' : ''}">
                <td class="rank">${rank}</td>
                <td class="area-name-cell">${area.name}${prefIcon}</td>
                <td><div class="score-breakdown">${renderScoreBar(area.total_score)}${renderScoreBreakdown(area.scores)}</div></td>
                <td class="num"><span class="commute-pill">${area.commute_minutes} min</span></td>
                <td class="num price">${formatPrice(area.avg_price)}</td>
                <td class="num price">${formatMonthly(area.mortgage_monthly)}</td>
                <td class="num price">${formatMonthly(area.effective_monthly)}</td>
                <td>${typeBadge}</td>
            </tr>`;
        }

        html += '</tbody></table></div>';
    }

    return html;
}

// ── Listings grid ──

function renderListings(listings) {
    if (listings.length === 0) {
        return `<div class="empty-state">
            <h2>No listings match your filters</h2>
            <p>Try enabling more areas in the filter chips above.</p>
        </div>`;
    }

    const sorted = sortListings(listings);

    const grouped = {};
    DATA.region_order.forEach(r => {
        const regionListings = sorted.filter(l => {
            const area = DATA.areas.find(a => a.name === l.area_name);
            return area && area.region === r;
        });
        if (regionListings.length > 0) grouped[r] = regionListings;
    });

    let html = '';

    for (const region of DATA.region_order) {
        if (!grouped[region]) continue;

        html += `<div class="region-section">
            <div class="region-header">
                <span class="region-name">${region}</span>
                <span class="region-count">${grouped[region].length} listings</span>
            </div>
            <div class="listing-grid">`;

        for (const listing of grouped[region]) {
            const isDismissed = dismissedListings.has(listing.id);
            const images = listing.image_urls || [];
            let imageHtml;
            if (images.length > 1) {
                const dots = images.map((_, i) =>
                    `<span class="slide-dot ${i === 0 ? 'active' : ''}" data-idx="${i}"></span>`
                ).join('');
                imageHtml = `<div class="card-slideshow" data-idx="0">
                    <img class="card-image" src="${images[0]}" alt="" loading="lazy">
                    <button class="slide-btn slide-prev">&lsaquo;</button>
                    <button class="slide-btn slide-next">&rsaquo;</button>
                    <div class="slide-dots">${dots}</div>
                </div>`;
            } else if (images.length === 1) {
                imageHtml = `<img class="card-image" src="${images[0]}" alt="" loading="lazy">`;
            } else {
                imageHtml = '<div class="card-image-placeholder">No image</div>';
            }

            const badges = [];
            if (listing.tenure) {
                const tenureLabel = listing.tenure.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                const tenureTip = listing.tenure.toLowerCase().includes('freehold')
                    ? 'You own the building and land outright — no ground rent or lease expiry to worry about'
                    : listing.tenure.toLowerCase().includes('share')
                    ? 'You own a share of the freehold with other residents — more control than leasehold, no single landlord'
                    : '';
                badges.push(`<span class="badge badge-freehold badge-tip" data-tip="${tenureTip}">${tenureLabel}</span>`);
            }
            if (listing.has_garden) badges.push('<span class="badge badge-garden badge-tip" data-tip="Listing mentions a garden — check photos to see if it\'s private or shared">Garden</span>');
            if (listing.has_balcony) badges.push('<span class="badge badge-balcony badge-tip" data-tip="Listing mentions a balcony — could be a Juliet balcony or full-size, check photos">Balcony</span>');

            // Valuation badges
            if (listing.vs_median_pct != null) {
                const pct = listing.vs_median_pct;
                const compMedian = listing.comparable_median ? formatPrice(listing.comparable_median) : '?';
                const compCount = listing.comparable_count || 0;
                const level = listing.comparable_level || 'outcode';
                const levelLabel = level === 'street' ? 'this street' : level === 'postcode' ? 'this postcode' : 'this area';
                if (pct <= -10) {
                    badges.push(`<span class="badge badge-undervalued badge-tip" data-tip="Asking price is ${Math.abs(Math.round(pct))}% below the ${compMedian} median sold price for similar properties on ${levelLabel} (based on ${compCount} Land Registry sales in the last 2 years). Could be a good deal — or there may be a reason it's cheap.">${Math.abs(Math.round(pct))}% below median</span>`);
                } else if (pct >= 10) {
                    badges.push(`<span class="badge badge-overvalued badge-tip" data-tip="Asking price is ${Math.round(pct)}% above the ${compMedian} median sold price for similar properties on ${levelLabel} (based on ${compCount} Land Registry sales in the last 2 years). Might be overpriced, or could have features that justify it.">${Math.round(pct)}% above median</span>`);
                } else {
                    badges.push(`<span class="badge badge-fair badge-tip" data-tip="Asking price is within 10% of the ${compMedian} median for similar properties on ${levelLabel} (${compCount} sales). Priced about right for the area.">Fair value</span>`);
                }
            }
            if (listing.area_growth_pct != null) {
                const g = listing.area_growth_pct;
                const cls = g >= 15 ? 'badge-growth-high' : g >= 0 ? 'badge-growth' : 'badge-growth-neg';
                const growthTip = g >= 15
                    ? `Property prices in this postcode have risen ${g.toFixed(0)}% over 5 years — a strong growth area. Good for building equity.`
                    : g >= 0
                    ? `Property prices in this postcode have risen ${g.toFixed(0)}% over 5 years — steady but not exceptional growth.`
                    : `Property prices in this postcode have fallen ${Math.abs(g).toFixed(0)}% over 5 years. Could mean a buying opportunity, or an area losing demand.`;
                badges.push(`<span class="badge ${cls} badge-tip" data-tip="${growthTip}">Area ${g >= 0 ? '+' : ''}${g.toFixed(0)}% (5yr)</span>`);
            }

            const isNew = listing.first_seen === new Date().toISOString().slice(0, 10);
            const isBoosted = areaPrefs[listing.area_name] === 'boosted';

            const areaScores = getAreaScores(listing.area_name);
            const commuteMin = getAreaCommute(listing.area_name);
            const scoreTooltip = areaScores ? renderScoreBreakdown(areaScores) : '';

            const loan = listing.price ? listing.price - 200000 : null;
            const monthlyMortgage = loan ? Math.round(loan * (0.045/12) * Math.pow(1 + 0.045/12, 31*12) / (Math.pow(1 + 0.045/12, 31*12) - 1)) : null;

            const linkUrl = listing.url || '#';
            const dismissLabel = isDismissed ? '↩' : '✕';
            const dismissTitle = isDismissed ? 'Restore listing' : 'Dismiss listing';

            html += `<div class="listing-card-v2-wrap ${isDismissed ? 'dismissed' : ''} ${isBoosted ? 'boosted' : ''}">
                <button class="card-dismiss" data-id="${listing.id}" title="${dismissTitle}">${dismissLabel}</button>
                <a class="listing-card-v2" href="${linkUrl}" target="_blank" rel="noopener">
                    <div class="card-image-wrap">
                        ${imageHtml}
                        ${isNew ? '<span class="card-badge-overlay">New</span>' : ''}
                        ${isBoosted ? '<span class="card-badge-overlay card-badge-boosted">★</span>' : ''}
                        ${listing.listing_score ? `<div class="card-score-overlay score-breakdown"><span class="card-score-pill ${getScoreTextClass(listing.listing_score)}">${(listing.listing_score * 100).toFixed(0)}</span>${scoreTooltip}</div>` : ''}
                    </div>
                    <div class="card-body">
                        <div class="card-title-row">
                            <span class="card-title">${listing.address || 'Unknown'}</span>
                        </div>
                        <div class="card-meta">${listing.area_name || ''} · ${listing.bedrooms || '?'} bed · ${listing.sqm ? listing.sqm + ' sqm' : ''} · ${listing.property_type || ''}</div>
                        <div class="card-meta"><span class="commute-pill">${commuteMin} min</span></div>
                        <div class="card-badges">${badges.join('')}</div>
                        <div class="card-price-row">
                            <span class="card-price">${formatPrice(listing.price)}</span>
                            <span class="card-monthly">${monthlyMortgage ? formatMonthly(monthlyMortgage) : ''}</span>
                        </div>
                        ${listing.comparable_median ? `<div class="card-comp-price">${listing.comparable_level === 'street' ? 'Street' : listing.comparable_level === 'postcode' ? 'Postcode' : 'Area'} median: ${formatPrice(listing.comparable_median)} (${listing.comparable_count} sales)</div>` : ''}
                        <div class="card-footer">
                            ${listing.first_seen ? `<span class="card-date">Added ${formatDate(listing.first_seen)}</span>` : ''}
                            ${listing.added_or_reduced && listing.added_or_reduced.toLowerCase().includes('reduced') ? `<span class="badge badge-reduced">${listing.added_or_reduced}</span>` : ''}
                        </div>
                    </div>
                </a>
            </div>`;
        }

        html += '</div></div>';
    }

    return html;
}

// ── Map view ──

let map = null;
let mapMarkers = [];

function renderMap(listings) {
    const content = document.getElementById('content');
    content.innerHTML = '<div id="map"></div>';

    // Clean up previous map
    if (map) { map.remove(); map = null; }

    map = L.map('map').setView([51.53, -0.1], 12);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
    }).addTo(map);

    // Add King's Cross marker
    L.marker([51.5308, -0.1238], {
        icon: L.divIcon({
            className: '',
            html: '<div style="background:#212529;color:white;padding:4px 8px;border-radius:6px;font-size:11px;font-weight:600;font-family:sans-serif;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3);">King\'s Cross</div>',
            iconSize: null,
            iconAnchor: [40, 12],
        })
    }).addTo(map);

    // Add listing markers
    mapMarkers = [];
    const bounds = [];

    for (const listing of listings) {
        // Get coordinates from the listing's area data
        const area = DATA.areas.find(a => a.name === listing.area_name);
        // Listings from Rightmove don't have individual coords in our data,
        // so we cluster by area location with slight jitter
        if (!area) continue;

        const jitterLat = (Math.random() - 0.5) * 0.004;
        const jitterLng = (Math.random() - 0.5) * 0.006;
        const lat = area.lat + jitterLat;
        const lng = area.lng + jitterLng;

        const score = listing.listing_score || 0;
        const scorePct = Math.round(score * 100);
        const scoreClass = score >= 0.65 ? '' : score >= 0.45 ? 'mid' : 'low';

        const priceStr = formatPrice(listing.price);
        const imageHtml = listing.image_urls && listing.image_urls.length > 0
            ? `<img src="${listing.image_urls[0]}" alt="">`
            : '';

        const linkUrl = listing.url || '#';
        const commuteMin = getAreaCommute(listing.area_name);

        const popupHtml = `<div class="map-popup">
            ${imageHtml}
            <div class="popup-title"><a href="${linkUrl}" target="_blank">${listing.address || 'Unknown'}</a></div>
            <div class="popup-meta">${listing.area_name} · ${listing.bedrooms || '?'} bed · ${listing.sqm ? listing.sqm + ' sqm' : ''} · ${commuteMin} min</div>
            <div class="popup-price">${priceStr}</div>
        </div>`;

        const marker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: '',
                html: `<div class="map-marker-label ${scoreClass}">${priceStr.replace('£', '£')}</div>`,
                iconSize: null,
                iconAnchor: [30, 12],
            })
        }).bindPopup(popupHtml, { maxWidth: 240 }).addTo(map);

        mapMarkers.push(marker);
        bounds.push([lat, lng]);
    }

    if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [30, 30] });
    }
}

// ── Main render ──

function render() {
    const content = document.getElementById('content');

    if (viewMode === 'areas') {
        if (map) { map.remove(); map = null; }
        const filtered = DATA.areas.filter(a => isAreaVisible(a.name));
        content.innerHTML = renderAreaTable(filtered);
    } else if (viewMode === 'map') {
        const filtered = getVisibleListings();
        renderMap(filtered);
    } else {
        if (map) { map.remove(); map = null; }
        const filtered = getVisibleListings();
        content.innerHTML = renderListings(filtered);
    }

    updateStats();
}

// Boot
init();

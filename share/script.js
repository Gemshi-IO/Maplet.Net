/* ==========================================================================
   Maplet Share — script.js
   Decodes a compressed folder payload from the `data` query param and
   renders the split-screen (desktop) / bottom-sheet (mobile) share page.
   Pipeline per DeepLinkSpecification.md §2-4: Base64URL -> raw DEFLATE
   (pako.inflateRaw, NOT inflate) -> minified JSON -> expanded model.
   ========================================================================== */

(function () {
  'use strict';

  const DEFAULT_ACCENT = '#007AFF';
  const MAP_STYLE_URL = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
  const SHEET_PEEK_PX = 132; // keep in sync with --sheet-peek in styles.css
  const MOBILE_QUERY = '(max-width: 768px)';

  const DIRECTIONS_ICON = 'M12 2 4.5 20.29l.71.71L12 18l6.79 3 .71-.71z';
  const PHONE_ICON =
    'M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24 11.36 11.36 0 0 0 3.58.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.36 11.36 0 0 0 .57 3.58 1 1 0 0 1-.25 1.01Z';
  const PIN_SVG_MARKUP =
    '<svg viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">' +
    '<path class="marker-pin-fill marker-pin-stroke" stroke="#ffffff" stroke-width="2" ' +
    'd="M15 1C7.3 1 1 7.3 1 15c0 9.4 12.3 21.8 13.3 22.8a1 1 0 0 0 1.4 0C16.7 36.8 29 24.4 29 15 29 7.3 22.7 1 15 1Z"/>' +
    '</svg>';

  const els = {
    loadingState: document.getElementById('loadingState'),
    errorState: document.getElementById('errorState'),
    layout: document.getElementById('layout'),
    sidebar: document.getElementById('sidebar'),
    sheetHandle: document.getElementById('sheetHandle'),
    folderName: document.getElementById('folderName'),
    folderMeta: document.getElementById('folderMeta'),
    locationList: document.getElementById('locationList'),
    openInAppBtn: document.getElementById('openInAppBtn'),
    themeColorMeta: document.getElementById('themeColorMeta'),
  };

  // ------------------------------------------------------------------------
  // Decoding pipeline (DeepLinkSpecification.md §2-4)
  // ------------------------------------------------------------------------

  function base64UrlToUint8Array(base64url) {
    let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) base64 += '=';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function getShareData() {
    const url = new URL(window.location.href);
    const dataParam = url.searchParams.get('data');
    if (!dataParam) throw new Error('Missing "data" query parameter.');

    const compressed = base64UrlToUint8Array(dataParam);
    // CRITICAL: raw DEFLATE, not zlib-wrapped — see DeepLinkSpecification.md §3.
    const json = pako.inflateRaw(compressed, { to: 'string' });
    const payload = JSON.parse(json);
    if (!payload || typeof payload !== 'object') {
      throw new Error('Decoded payload is not an object.');
    }
    return { payload, rawParam: dataParam };
  }

  function isValidHexColor(value) {
    return typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
  }

  // Untrusted input (§9: "no signature/auth on the payload") — every field is
  // type-checked and defaulted rather than trusted as-is.
  function expandLocation(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const lat = Number(raw.la);
    const lon = Number(raw.lo);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

    const rating = Number(raw.r);

    return {
      title: typeof raw.ti === 'string' && raw.ti.trim() ? raw.ti : 'Untitled place',
      latitude: lat,
      longitude: lon,
      category: typeof raw.c === 'string' && raw.c ? raw.c : 'Other',
      isVisited: raw.v === true,
      notes: typeof raw.n === 'string' && raw.n ? raw.n : null,
      address: typeof raw.a === 'string' && raw.a ? raw.a : null,
      landmarkName: typeof raw.lm === 'string' && raw.lm ? raw.lm : null,
      city: typeof raw.ci === 'string' && raw.ci ? raw.ci : null,
      state: typeof raw.s === 'string' && raw.s ? raw.s : null,
      country: typeof raw.co === 'string' && raw.co ? raw.co : null,
      timeZone: typeof raw.tz === 'string' && raw.tz ? raw.tz : null,
      telephoneNumber: typeof raw.t === 'string' && raw.t ? raw.t : null,
      contactPerson: typeof raw.cp === 'string' && raw.cp ? raw.cp : null,
      rating: Number.isFinite(rating) ? Math.min(5, Math.max(1, Math.round(rating))) : null,
    };
  }

  function expandPayload(payload) {
    const folderName = typeof payload.fn === 'string' && payload.fn ? payload.fn : 'Shared Folder';
    const folderColor = isValidHexColor(payload.fc) ? payload.fc : DEFAULT_ACCENT;
    const sharedDate = Number.isFinite(payload.sd) ? new Date(payload.sd * 1000) : null;
    const rawLocations = Array.isArray(payload.l) ? payload.l : [];

    return {
      folderName,
      folderColor,
      sharedDate,
      // fi (SF Symbol) is intentionally unused — not renderable on web, see spec §6/§9.
      locations: rawLocations.map(expandLocation).filter(Boolean),
    };
  }

  // ------------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------------

  function isMobileLayout() {
    return window.matchMedia(MOBILE_QUERY).matches;
  }

  function isApplePlatform() {
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isMac = /Macintosh/.test(ua) && navigator.maxTouchPoints === 0;
    return isIOS || isMac;
  }

  function directionsUrl(loc) {
    const dest = `${loc.latitude},${loc.longitude}`;
    return isApplePlatform()
      ? `https://maps.apple.com/?daddr=${dest}&dirflg=d`
      : `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
  }

  function buildAddress(loc) {
    if (loc.address) return loc.address;
    const parts = [loc.landmarkName, loc.city, loc.state, loc.country].filter(Boolean);
    return parts.length ? parts.join(', ') : null;
  }

  function formatSharedDate(date) {
    if (!date) return '';
    try {
      return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
    } catch {
      return '';
    }
  }

  function createIconLink(href, label, iconPath, attrs) {
    const a = document.createElement('a');
    a.className = 'action-btn';
    a.href = href;
    Object.assign(a, attrs || {});
    a.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${iconPath}"/></svg><span></span>`;
    a.querySelector('span').textContent = label; // label rendered as text, never HTML
    return a;
  }

  // ------------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------------

  function showLoading() {
    els.loadingState.hidden = false;
    els.errorState.hidden = true;
    els.layout.hidden = true;
    document.getElementById('app').classList.remove('has-sidebar');
  }

  function showError() {
    els.loadingState.hidden = true;
    els.errorState.hidden = false;
    els.layout.hidden = true;
    document.getElementById('app').classList.remove('has-sidebar');
  }

  function showApp() {
    els.loadingState.hidden = true;
    els.errorState.hidden = true;
    els.layout.hidden = false;
    document.getElementById('app').classList.add('has-sidebar');
  }

  function applyAccentColor(hex) {
    document.documentElement.style.setProperty('--accent', hex);
    document.documentElement.style.setProperty('--accent-soft', hexToSoftRgba(hex));
    if (els.themeColorMeta) els.themeColorMeta.setAttribute('content', hex);
  }

  function hexToSoftRgba(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, 0.12)`;
  }

  function renderHeader(model) {
    els.folderName.textContent = model.folderName;
    const count = model.locations.length;
    const countStr = `${count} location${count === 1 ? '' : 's'}`;
    const sharedStr = formatSharedDate(model.sharedDate);
    els.folderMeta.textContent = sharedStr ? `${countStr} · Shared ${sharedStr}` : countStr;
  }

  function buildLocationCard(loc, index) {
    const card = document.createElement('article');
    card.className = 'location-card';
    card.dataset.index = String(index);
    card.setAttribute('role', 'listitem');
    card.tabIndex = 0;

    const top = document.createElement('div');
    top.className = 'card-top';

    const badge = document.createElement('span');
    badge.className = 'pin-badge';
    badge.textContent = String(index + 1);
    top.appendChild(badge);

    const titleWrap = document.createElement('div');
    titleWrap.className = 'card-title-wrap';

    const title = document.createElement('h3');
    title.className = 'card-title';
    title.textContent = loc.title;
    titleWrap.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'card-meta';

    const catTag = document.createElement('span');
    catTag.className = 'category-tag';
    catTag.textContent = loc.category;
    meta.appendChild(catTag);

    if (loc.rating) {
      const rating = document.createElement('span');
      rating.className = 'rating';
      rating.textContent = '★'.repeat(loc.rating) + '☆'.repeat(5 - loc.rating);
      meta.appendChild(rating);
    }

    if (loc.isVisited) {
      const visited = document.createElement('span');
      visited.className = 'visited-badge';
      visited.textContent = '✓ Visited';
      meta.appendChild(visited);
    }

    titleWrap.appendChild(meta);
    top.appendChild(titleWrap);
    card.appendChild(top);

    const address = buildAddress(loc);
    if (address) {
      const addrEl = document.createElement('p');
      addrEl.className = 'card-address';
      addrEl.textContent = address;
      card.appendChild(addrEl);
    }

    if (loc.notes) {
      const notesEl = document.createElement('p');
      notesEl.className = 'card-notes';
      notesEl.textContent = loc.notes;
      card.appendChild(notesEl);
    }

    const actions = document.createElement('div');
    actions.className = 'card-actions';
    actions.appendChild(
      createIconLink(directionsUrl(loc), 'Directions', DIRECTIONS_ICON, { target: '_blank', rel: 'noopener' })
    );
    if (loc.telephoneNumber) {
      actions.appendChild(createIconLink(`tel:${loc.telephoneNumber}`, 'Contact', PHONE_ICON));
    }
    card.appendChild(actions);

    return card;
  }

  function buildMarkerElement(index) {
    const el = document.createElement('div');
    el.className = 'map-marker';
    el.style.position = 'relative';
    el.dataset.index = String(index);
    el.innerHTML = PIN_SVG_MARKUP;

    const number = document.createElement('span');
    number.className = 'marker-number';
    number.textContent = String(index + 1);
    el.appendChild(number);

    return el;
  }

  // ------------------------------------------------------------------------
  // Map + sidebar sync
  // ------------------------------------------------------------------------

  function initMap(model) {
    const hasLocations = model.locations.length > 0;
    const map = new maplibregl.Map({
      container: 'map',
      style: MAP_STYLE_URL,
      center: hasLocations
        ? [model.locations[0].longitude, model.locations[0].latitude]
        : [0, 20],
      zoom: hasLocations ? 12 : 1.5,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    return map;
  }

  function getFitBoundsPadding() {
    return isMobileLayout()
      ? { top: 60, bottom: SHEET_PEEK_PX + 40, left: 40, right: 40 }
      // Desktop: the sidebar is a flex sibling (not an overlay), so #map's own
      // width already excludes it — no extra left padding needed.
      : { top: 60, bottom: 60, left: 60, right: 60 };
  }

  function fitToLocations(map, model) {
    if (!model.locations.length) return;
    if (model.locations.length === 1) {
      map.jumpTo({ center: [model.locations[0].longitude, model.locations[0].latitude], zoom: 14 });
      return;
    }
    const bounds = new maplibregl.LngLatBounds();
    model.locations.forEach((loc) => bounds.extend([loc.longitude, loc.latitude]));
    map.fitBounds(bounds, { padding: getFitBoundsPadding(), duration: 0 });
  }

  function setupSync(map, model, cardEls, markerEls) {
    let hoveredIndex = -1;
    let pinnedIndex = -1;

    function currentIndex() {
      return hoveredIndex !== -1 ? hoveredIndex : pinnedIndex;
    }

    function refreshHighlight() {
      const idx = currentIndex();
      cardEls.forEach((c, i) => c.classList.toggle('is-active', i === idx));
      markerEls.forEach((m, i) => m.classList.toggle('is-highlighted', i === idx));
    }

    function panTo(index) {
      const loc = model.locations[index];
      if (!loc) return;
      map.easeTo({ center: [loc.longitude, loc.latitude], zoom: Math.max(map.getZoom(), 14), duration: 500 });
    }

    function expandSheetIfMobile() {
      if (isMobileLayout()) els.sidebar.classList.add('is-expanded');
    }

    cardEls.forEach((card, i) => {
      card.addEventListener('mouseenter', () => {
        hoveredIndex = i;
        refreshHighlight();
        panTo(i);
      });
      card.addEventListener('mouseleave', () => {
        hoveredIndex = -1;
        refreshHighlight();
      });
      card.addEventListener('click', () => {
        pinnedIndex = i;
        hoveredIndex = i;
        refreshHighlight();
        panTo(i);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          pinnedIndex = i;
          refreshHighlight();
          panTo(i);
        }
      });
    });

    markerEls.forEach((markerEl, i) => {
      markerEl.addEventListener('mouseenter', () => {
        hoveredIndex = i;
        refreshHighlight();
      });
      markerEl.addEventListener('mouseleave', () => {
        hoveredIndex = -1;
        refreshHighlight();
      });
      markerEl.addEventListener('click', (e) => {
        e.stopPropagation();
        pinnedIndex = i;
        refreshHighlight();
        expandSheetIfMobile();
        cardEls[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }

  function renderLocations(model, map) {
    els.locationList.innerHTML = '';
    const cardEls = [];
    const markerEls = [];

    model.locations.forEach((loc, index) => {
      const card = buildLocationCard(loc, index);
      els.locationList.appendChild(card);
      cardEls.push(card);

      const markerEl = buildMarkerElement(index);
      new maplibregl.Marker({ element: markerEl, anchor: 'bottom' })
        .setLngLat([loc.longitude, loc.latitude])
        .addTo(map);
      markerEls.push(markerEl);
    });

    setupSync(map, model, cardEls, markerEls);
  }

  // ------------------------------------------------------------------------
  // Mobile bottom sheet drag
  // ------------------------------------------------------------------------

  function setupBottomSheet() {
    const sheet = els.sidebar;
    const handle = els.sheetHandle;
    let dragging = false;
    let dragStartY = 0;
    let dragStartOffset = 0;

    function collapsedOffsetPx() {
      return sheet.getBoundingClientRect().height - SHEET_PEEK_PX;
    }

    function currentOffsetPx() {
      return sheet.classList.contains('is-expanded') ? 0 : collapsedOffsetPx();
    }

    function onDragStart(clientY) {
      if (!isMobileLayout()) return;
      dragging = true;
      dragStartY = clientY;
      dragStartOffset = currentOffsetPx();
      sheet.classList.add('is-dragging');
    }

    function onDragMove(clientY) {
      if (!dragging) return;
      const delta = clientY - dragStartY;
      const maxOffset = collapsedOffsetPx();
      const next = Math.min(maxOffset, Math.max(0, dragStartOffset + delta));
      sheet.style.transform = `translateY(${next}px)`;
    }

    function onDragEnd(clientY) {
      if (!dragging) return;
      dragging = false;
      sheet.classList.remove('is-dragging');
      sheet.style.transform = '';

      const delta = clientY - dragStartY;
      if (Math.abs(delta) < 6) {
        // Treat as a tap on the handle rather than a drag.
        sheet.classList.toggle('is-expanded');
        return;
      }
      const maxOffset = collapsedOffsetPx();
      const finalOffset = Math.min(maxOffset, Math.max(0, dragStartOffset + delta));
      sheet.classList.toggle('is-expanded', finalOffset < maxOffset * 0.5);
    }

    handle.addEventListener('pointerdown', (e) => {
      handle.setPointerCapture(e.pointerId);
      onDragStart(e.clientY);
    });
    handle.addEventListener('pointermove', (e) => onDragMove(e.clientY));
    handle.addEventListener('pointerup', (e) => onDragEnd(e.clientY));
    handle.addEventListener('pointercancel', (e) => onDragEnd(e.clientY));
  }

  // ------------------------------------------------------------------------
  // Bootstrap
  // ------------------------------------------------------------------------

  function render(model, rawParam) {
    applyAccentColor(model.folderColor);
    renderHeader(model);

    setupBottomSheet();
    showApp();

    // MapLibre measures its container at construct time. The layout starts
    // `[hidden]`, so the map must be created *after* showApp() or the canvas
    // stays ~0px tall (blank gray band on mobile).
    const map = initMap(model);
    map.on('load', () => {
      renderLocations(model, map);
      fitToLocations(map, model);
    });
    requestAnimationFrame(() => map.resize());
    window.addEventListener('resize', () => map.resize());

    els.openInAppBtn.addEventListener('click', () => {
      // Per spec §8: manual fallback re-attempt at the legacy custom scheme,
      // reusing the same (new-format, compressed) payload as-is.
      window.location.href = `maplet://import?data=${rawParam}`;
    });
  }

  function init() {
    showLoading();

    let decoded;
    try {
      decoded = getShareData();
    } catch (err) {
      console.error('[Maplet] Failed to decode share link:', err);
      showError();
      return;
    }

    let model;
    try {
      model = expandPayload(decoded.payload);
    } catch (err) {
      console.error('[Maplet] Failed to expand payload:', err);
      showError();
      return;
    }

    render(model, decoded.rawParam);
  }

  init();
})();

// ============================================================
// SPGo Shared Core — spgo-core.js
// Loaded by all SPGo portals via jsDelivr
// Contains: state, GAS connection, login, profile pic, navigation
// ============================================================

// ============================================================
// STATE
// ============================================================
let currentUser = null;
let currentUserName = 'Guest';
let currentFsSubscriber = false;
let currentHasPortal = false;
let currentHasBara = false;
let currentTier = 0; // 1, 2, or 3 (0 = none/guest)
let isGuest = false;
let mapInstance = null;
let drawMode = false;
let drawnLine = null;
let drawCanvas = null;
let drawCtx = null;
let mapStartPt = null;
let mapCurrentPt = null;
let isDrawing = false;
let currentTrueBearing = null;
let currentMapLatLng = null; // center of map
let currentPeriodForRuler = null;
let kwSelectedMethod = 'quantum';
let kwIsDrawing = false;
let kwHistory = [];

// ============================================================
// LOGIN — Direct OAuth redirect (no library, guaranteed to work)
// ============================================================
// ============================================================
// UNIFIED JSONP helper for ALL GAS calls (avoids CORS issues)
// ============================================================
const GAS_URL = 'https://script.google.com/macros/s/AKfycbzA4RwYNLcv60HWAHOh2gQgeCfuOWAb0kyqP7BaiujKI5hylDQKEc4Cu6QtTs77PA7FnQ/exec';

function gasJsonp(params, onSuccess, onError, timeoutMs) {
  const cbName = 'gasCB_' + Date.now() + '_' + Math.floor(Math.random()*9999);
  const script = document.createElement('script');
  const url = GAS_URL + '?' + params + '&callback=' + cbName;
  const timer = setTimeout(() => {
    cleanup();
    if (onError) onError('Timeout');
  }, timeoutMs || 15000);
  function cleanup() {
    clearTimeout(timer);
    delete window[cbName];
    if (script.parentNode) script.parentNode.removeChild(script);
  }
  window[cbName] = function(data) { cleanup(); onSuccess(data); };
  script.onerror = function() { cleanup(); if (onError) onError('Script load failed'); };
  document.head.appendChild(script);
  script.src = url;
}
const GOOGLE_CLIENT_ID = '427989206862-svhf1cote22nhdhkq68ff14446upp2m4.apps.googleusercontent.com';

// On page load — check if returning from Google OAuth redirect
// (runs after all functions are defined)
function checkOAuthReturn() {
  try {
    // ── Approach 2: Upstream Cache Eviction ──────────────────────────────
    // If returning from Google OAuth, the stale cached version of this script
    // may have already caused a broken session. Flush the browser's Cache
    // Storage API now — before any login logic runs — so the next GAS call
    // and any subsequent page load gets a fresh copy of all assets.
    if (window.location.hash && window.location.hash.includes('access_token')) {
      if ('caches' in window) {
        caches.keys().then(function(cacheNames) {
          cacheNames.forEach(function(cacheName) {
            caches.delete(cacheName);
          });
        });
      }
    }
    // ────────────────────────────────────────────────────────────────────

    // Check for saved login in localStorage (max 30 days)
    const saved = localStorage.getItem('go_saved_user');
    if (saved && !window.location.hash.includes('access_token')) {
      const s = JSON.parse(saved);
      const age = Date.now() - (s.savedAt || 0);
      if (age < 30 * 24 * 3600 * 1000 && s.user && s.email) {
        // Restore session immediately so user isn't logged out
        currentUser = s.user;
        currentUserName = s.name || s.user;
        currentFsSubscriber = !!s.fs;
        currentHasPortal = !!s.portal;
        currentHasBara = !!s.hasBara;
        currentTier = s.tier || 0;
        isGuest = false;
        setHomeState();
        updateProfileCorner();
        goTo('screen-B0');
        // Re-fetch from GAS in background to refresh name/portal/tier
        gasJsonp('action=validateEmail&email=' + encodeURIComponent(s.email), function(data) {
          if (data.valid) {
            currentUserName = data.name || currentUser;
            currentFsSubscriber = data.fsSubscriber === true;
            currentHasPortal = data.hasPortal === true;
            currentHasBara = data.hasBara === true;
            currentTier = data.tier || 0;
            // Update cache with fresh data
            try {
              localStorage.setItem('go_saved_user', JSON.stringify({
                user: currentUser, name: currentUserName,
                fs: currentFsSubscriber, portal: currentHasPortal,
                hasBara: currentHasBara, tier: currentTier,
                email: s.email, savedAt: Date.now()
              }));
            } catch(e) {}
            setHomeState();
            updateProfileCorner();
          }
        }, null);
        return;
      } else {
        localStorage.removeItem('go_saved_user');
      }
    }
    const hash = window.location.hash;
    if (!hash || !hash.includes('access_token')) return;
    const params = new URLSearchParams(hash.replace('#', ''));
    const token = params.get('access_token');
    if (token) {
      // IMPORTANT: save the token to sessionStorage BEFORE clearing the hash.
      // Mobile Chrome can interrupt async flows mid-flight; keeping the token
      // in sessionStorage means it survives even if the page briefly reloads.
      try { sessionStorage.setItem('go_pending_token', token); } catch(e) {}
      // Only now is it safe to clean up the URL hash.
      history.replaceState({}, '', window.location.pathname);
      validateWithToken(token);
    }
  } catch(e) {}
}

async function validateWithToken(token) {
  // Show verifying state — portals override showVerifying() for their own screen
  if (typeof showVerifying === 'function') showVerifying();
  else {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const verifyScreen = document.getElementById('screen-B0-verify');
    if (verifyScreen) verifyScreen.classList.add('active');
  }

  try {
    const infoResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + token }
    });
    const userInfo = await infoResp.json();
    const email = userInfo.email;

    if (!email) {
      goTo('screen-B0-login');
      showLoginError('Could not get your email from Google. Please try again.');
      return;
    }

    // JSONP to avoid CORS with GAS
    gasJsonp('action=validateEmail&email=' + encodeURIComponent(email), function(data) {
      if (data.valid) {
        currentUser = data.idCode || email;
        currentUserName = data.name || data.idCode || email;
        currentFsSubscriber = data.fsSubscriber === true;
        currentHasPortal = data.hasPortal === true;
        currentHasBara = data.hasBara === true;
        currentTier = data.tier || 0;
        isGuest = false;
        try {
          localStorage.setItem('go_saved_user', JSON.stringify({
            user: currentUser, name: currentUserName,
            fs: currentFsSubscriber, portal: currentHasPortal,
            hasBara: currentHasBara, tier: currentTier,
            email: email, savedAt: Date.now()
          }));
          // Token safely committed — clear the sessionStorage safety net
          sessionStorage.removeItem('go_pending_token');
        } catch(e) {}
        setHomeState();
        updateProfileCorner();
        goTo('screen-B0');
      } else {
        goTo('screen-B0-login');
        showLoginError('Your account (' + email + ') is not registered. Please contact your administrator.');
      }
    }, function() {
      goTo('screen-B0-login');
      showLoginError('Connection error. Check your internet and try again.');
    });
  } catch(e) {
    goTo('screen-B0-login');
    showLoginError('Connection error. Check your internet and try again.');
  }
}

function showVerifying() {
  // Default for SuperPortal — portals override this
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const verifyScreen = document.getElementById('screen-B0-verify');
  if (verifyScreen) verifyScreen.classList.add('active');
}

function startGoogleLogin() {
  // Build Google OAuth URL — implicit flow, returns access_token in hash
  const redirectUri = window.location.origin + window.location.pathname;
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: 'email profile',
    prompt: 'select_account'
  });
  // Redirect to Google — user picks account, Google redirects back with token
  window.location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

const PROFILE_PIX_FOLDER = '1lqdsCGjE1-O51Y6JxGHuTdlhDvaFH-rA';
let cachedProfilePicDataUri = null;
let cachedProfilePicIsPersonal = false;

function updateProfileCorner() {
  const corner = document.getElementById('profile-corner');
  const img = document.getElementById('profile-corner-img');
  const code = document.getElementById('profile-corner-code');
  if (!corner) return;
  if (isGuest) {
    corner.style.display = 'flex';
    img.style.display = 'none';
    code.innerHTML = 'Guest<br><span style="font-size:11px;">🆓</span>';
    return;
  }
  if (!currentUser) { corner.style.display = 'none'; return; }
  corner.style.display = 'flex';
  const tierLabel = currentTier === 1 ? 'Tier 1 💎'
                  : currentTier === 2 ? 'Tier 2'
                  : currentTier === 3 ? 'Tier 3'
                  : '';
  code.innerHTML = currentUser + (tierLabel ? '<br><span style="font-size:8px;color:rgba(0,191,255,0.6);letter-spacing:0.05em;">' + tierLabel + '</span>' : '');
  // Load from Drive via GAS (uses cache if already loaded this session)
  loadProfilePic(currentUser, currentTier, function(dataUri, isPersonal) {
    if (dataUri) {
      img.src = dataUri;
      img.style.display = 'block';
      if (isPersonal) {
        img.classList.remove('flower-pic');
      } else {
        img.classList.add('flower-pic');
      }
    } else { img.style.display = 'none'; }
  });
}

function ppuCheckUriTransparency(dataUri, onResult) {
  // Load the image from data URI and check for transparent pixels
  const testImg = new Image();
  testImg.onload = function() {
    const tc = document.createElement('canvas');
    tc.width = testImg.width; tc.height = testImg.height;
    const tctx = tc.getContext('2d', { willReadFrequently: true });
    tctx.drawImage(testImg, 0, 0);
    const w = testImg.width, h = testImg.height;
    const pts = [[2,2],[w-2,2],[2,h-2],[w-2,h-2],[w/2,2],[2,h/2],[w-2,h/2],[w/2,h-2]];
    let transparentCount = 0;
    for (const [cx, cy] of pts) {
      try {
        const px = tctx.getImageData(Math.round(cx), Math.round(cy), 1, 1).data;
        if (px[3] < 30) transparentCount++;
      } catch(e) {}
    }
    onResult(transparentCount >= 4);
  };
  testImg.onerror = function() { onResult(false); };
  testImg.src = dataUri;
}

function loadProfilePic(idCode, tier, callback) {
  if (cachedProfilePicDataUri) { callback(cachedProfilePicDataUri, cachedProfilePicIsPersonal); return; }
  gasJsonp('action=getProfilePic&idCode=' + encodeURIComponent(idCode) + '&tier=' + (tier||0), function(data) {
    if (data.data) {
      const mime = data.mime || 'image/png';
      const uri = 'data:' + mime + ';base64,' + data.data;
      if (data.isPersonal) {
        // Personal pic — check if it has transparent background
        ppuCheckUriTransparency(uri, function(isTransparent) {
          // isPersonal=true but transparent=treat like flower (no circle)
          const showAsCircle = !isTransparent;
          cachedProfilePicDataUri = uri;
          cachedProfilePicIsPersonal = showAsCircle;
          callback(uri, showAsCircle);
        });
      } else {
        // Tier default — always flower style
        cachedProfilePicDataUri = uri;
        cachedProfilePicIsPersonal = false;
        callback(uri, false);
      }
    } else {
      callback(null, false);
    }
  }, function() { callback(null, false); });
}

function toggleLogoutPopup() {
  const popup = document.getElementById('logout-popup');
  if (!popup) return;
  const showing = popup.style.display === 'flex';
  popup.style.display = showing ? 'none' : 'flex';
}

function doLogout() {
  try { localStorage.removeItem('go_saved_user'); } catch(e) {}
  document.getElementById('logout-popup').style.display = 'none';
  document.getElementById('profile-corner').style.display = 'none';
  currentUser = null; currentUserName = 'Guest';
  currentFsSubscriber = false; currentHasPortal = false; isGuest = false;
  goTo('screen-B0-login');
}

// Close popup when clicking elsewhere
document.addEventListener('click', function(e) {
  const popup = document.getElementById('logout-popup');
  const corner = document.getElementById('profile-corner');
  if (popup && popup.style.display === 'flex' && !popup.contains(e.target) && !corner.contains(e.target)) {
    popup.style.display = 'none';
  }
});

// ============================================================
// PROFILE PIC UPLOADER
// ============================================================
let ppuState = { scale: 1, x: 0, y: 0, dragging: false, lastX: 0, lastY: 0, naturalW: 0, naturalH: 0 };
const PPU_SIZE = 260; // crop circle diameter in px

function showProfilePicUploader() {
  document.getElementById('logout-popup').style.display = 'none';
  document.getElementById('ppu-step1').style.display = 'flex';
  document.getElementById('ppu-step2').style.display = 'none';
  document.getElementById('ppu-status').textContent = '';
  document.getElementById('ppu-file-input').value = '';
  document.getElementById('profile-pic-modal').style.display = 'flex';
}

function closePpuModal() {
  document.getElementById('profile-pic-modal').style.display = 'none';
}

function ppuFileChosen(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = document.getElementById('ppu-img');
    img.onload = function() {
      ppuState.naturalW = img.naturalWidth;
      ppuState.naturalH = img.naturalHeight;
      const fitScale = Math.max(PPU_SIZE / img.naturalWidth, PPU_SIZE / img.naturalHeight);
      ppuState.scale = fitScale;
      ppuState.x = (PPU_SIZE - img.naturalWidth * fitScale) / 2;
      ppuState.y = (PPU_SIZE - img.naturalHeight * fitScale) / 2;
      ppuApplyTransform();
      document.getElementById('ppu-step1').style.display = 'none';
      document.getElementById('ppu-step2').style.display = 'flex';
      // Fit button always visible in step 2
      const fitBtn = document.getElementById('ppu-fit-btn');
      if (fitBtn) fitBtn.style.display = 'block';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function ppuApplyTransform() {
  const img = document.getElementById('ppu-img');
  img.style.width = (ppuState.naturalW * ppuState.scale) + 'px';
  img.style.height = (ppuState.naturalH * ppuState.scale) + 'px';
  img.style.left = ppuState.x + 'px';
  img.style.top = ppuState.y + 'px';
}

function ppuZoom(delta) {
  const oldScale = ppuState.scale;
  ppuState.scale = Math.max(0.2, Math.min(10, ppuState.scale + delta * ppuState.scale));
  const ratio = ppuState.scale / oldScale;
  ppuState.x = PPU_SIZE/2 - ratio * (PPU_SIZE/2 - ppuState.x);
  ppuState.y = PPU_SIZE/2 - ratio * (PPU_SIZE/2 - ppuState.y);
  ppuApplyTransform();
}

function ppuFitObject() {
  if (!ppuState.naturalW || !ppuState.naturalH) return;
  // For a square image to fit inside a circle, the diagonal must fit within the circle diameter.
  // So max safe size = PPU_SIZE / sqrt(2) with a small margin
  const margin = 8;
  const maxSize = (PPU_SIZE / Math.SQRT2) - margin;
  const fitScale = Math.min(maxSize / ppuState.naturalW, maxSize / ppuState.naturalH);
  ppuState.scale = fitScale;
  ppuState.x = (PPU_SIZE - ppuState.naturalW * fitScale) / 2;
  ppuState.y = (PPU_SIZE - ppuState.naturalH * fitScale) / 2;
  ppuApplyTransform();
}

// Drag to reposition
(function() {
  function setupDrag() {
    const wrap = document.getElementById('ppu-crop-wrap');
    if (!wrap) return;

    // Mouse
    wrap.addEventListener('mousedown', function(e) {
      ppuState.dragging = true; ppuState.lastX = e.clientX; ppuState.lastY = e.clientY;
      wrap.style.cursor = 'grabbing'; e.preventDefault();
    });
    document.addEventListener('mousemove', function(e) {
      if (!ppuState.dragging) return;
      ppuState.x += e.clientX - ppuState.lastX;
      ppuState.y += e.clientY - ppuState.lastY;
      ppuState.lastX = e.clientX; ppuState.lastY = e.clientY;
      ppuApplyTransform();
    });
    document.addEventListener('mouseup', function() {
      ppuState.dragging = false;
      const wrap = document.getElementById('ppu-crop-wrap');
      if (wrap) wrap.style.cursor = 'grab';
    });

    // Touch
    wrap.addEventListener('touchstart', function(e) {
      if (e.touches.length === 1) {
        ppuState.dragging = true;
        ppuState.lastX = e.touches[0].clientX; ppuState.lastY = e.touches[0].clientY;
      }
    }, {passive: true});
    wrap.addEventListener('touchmove', function(e) {
      if (!ppuState.dragging || e.touches.length !== 1) return;
      ppuState.x += e.touches[0].clientX - ppuState.lastX;
      ppuState.y += e.touches[0].clientY - ppuState.lastY;
      ppuState.lastX = e.touches[0].clientX; ppuState.lastY = e.touches[0].clientY;
      ppuApplyTransform(); e.preventDefault();
    }, {passive: false});
    wrap.addEventListener('touchend', function() { ppuState.dragging = false; });

    // Scroll to zoom
    wrap.addEventListener('wheel', function(e) {
      e.preventDefault();
      ppuZoom(e.deltaY < 0 ? 0.1 : -0.1);
    }, {passive: false});
  }
  // Wait for DOM
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupDrag);
  else setupDrag();
})();

function ppuDetectTransparency(img) {
  // Draw original image at natural size onto a test canvas, check for transparent pixels
  const testCanvas = document.createElement('canvas');
  testCanvas.width = img.naturalWidth; testCanvas.height = img.naturalHeight;
  const testCtx = testCanvas.getContext('2d', { willReadFrequently: true });
  testCtx.drawImage(img, 0, 0);
  // Sample corners of the actual image
  const w = img.naturalWidth, h = img.naturalHeight;
  const pts = [[2,2],[w-2,2],[2,h-2],[w-2,h-2],[w/2,2],[2,h/2],[w-2,h/2],[w/2,h-2]];
  let transparentCount = 0;
  for (const [cx, cy] of pts) {
    try {
      const pixel = testCtx.getImageData(Math.round(cx), Math.round(cy), 1, 1).data;
      if (pixel[3] < 30) transparentCount++;
    } catch(e) {}
  }
  return transparentCount >= 4;
}

async function ppuUpload() {
  const statusEl = document.getElementById('ppu-status');
  const btn = document.getElementById('ppu-upload-btn');
  const img = document.getElementById('ppu-img');
  if (!img.src) return;

  const OUT = 400;
  const canvas = document.createElement('canvas');
  canvas.width = OUT; canvas.height = OUT;
  const ctx = canvas.getContext('2d');

  // Detect if image has transparent background (check original image, not crop)
  const isTransparent = ppuDetectTransparency(img);

  const scaleRatio = OUT / PPU_SIZE;

  if (isTransparent) {
    // Transparent image — draw without clipping, canvas stays transparent
    // canvas default is transparent so no fill needed
    ctx.drawImage(img,
      ppuState.x * scaleRatio, ppuState.y * scaleRatio,
      ppuState.naturalW * ppuState.scale * scaleRatio,
      ppuState.naturalH * ppuState.scale * scaleRatio
    );
  } else {
    // Solid background — clip to circle
    ctx.beginPath(); ctx.arc(OUT/2, OUT/2, OUT/2, 0, Math.PI*2); ctx.clip();
    ctx.drawImage(img,
      ppuState.x * scaleRatio, ppuState.y * scaleRatio,
      ppuState.naturalW * ppuState.scale * scaleRatio,
      ppuState.naturalH * ppuState.scale * scaleRatio
    );
  }

  // Transparent images use PNG to preserve alpha; solid use JPEG for size
  let dataUrl;
  if (isTransparent) {
    dataUrl = canvas.toDataURL('image/png'); // preserves alpha — no black bg
  } else {
    let quality = 0.85;
    do {
      dataUrl = canvas.toDataURL('image/jpeg', quality);
      quality -= 0.1;
    } while (dataUrl.length > 400000 && quality > 0.3);
  }

  btn.disabled = true;
  statusEl.textContent = 'Uploading…';

  const base64 = dataUrl.split(',')[1];

  try {
    const formData = new FormData();
    formData.append('action', 'saveProfilePic');
    formData.append('idCode', currentUser);
    formData.append('data', base64);
    formData.append('isTransparent', isTransparent ? '1' : '0');
    const response = await fetch(GAS_URL, {
      method: 'POST',
      body: formData
    });
    const res = await response.json();
    btn.disabled = false;
    if (res.success) {
      statusEl.textContent = '✅ Saved! Refreshing…';
      // Clear cache so updateProfileCorner re-fetches from GAS with isPersonal flag
      cachedProfilePicDataUri = null;
      cachedProfilePicIsPersonal = false;
      setTimeout(function() {
        updateProfileCorner();
        closePpuModal();
      }, 1500);
    } else {
      statusEl.textContent = '❌ Error: ' + (res.error || 'Upload failed');
    }
  } catch(err) {
    btn.disabled = false;
    statusEl.textContent = '❌ Connection error. Try again.';
  }
}

function showIdInput() {}
function loginWithId() {}
function handleGoogleLogin() {}
function initGoogleAuth() {}

// TWO — Use default profile pic (delete personal pic)
async function useDefaultProfilePic() {
  const popup = document.getElementById('logout-popup');
  if (popup) popup.style.display = 'none';
  if (!currentUser) return;
  if (!confirm('This will remove your personal profile pic and restore the default tier image. Continue?')) return;
  try {
    const formData = new FormData();
    formData.append('action', 'deleteProfilePic');
    formData.append('idCode', currentUser);
    const response = await fetch(GAS_URL, { method: 'POST', body: formData });
    const res = await response.json();
    if (res.success) {
      cachedProfilePicDataUri = null;
      cachedProfilePicIsPersonal = false;
      updateProfileCorner(); // reloads from GAS — will get tier default
    } else {
      alert('Could not remove profile pic: ' + (res.error || 'Unknown error'));
    }
  } catch(err) {
    alert('Connection error. Try again.');
  }
}

function guestLogin() {
  currentUser = null;
  currentUserName = 'Guest';
  currentFsSubscriber = false;
  currentHasPortal = false;
  isGuest = true;
  try { localStorage.removeItem('go_saved_user'); } catch(e) {}
  setHomeState();
  updateProfileCorner();
  goTo('screen-B0');
}

function getTimeGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  if (h >= 17 && h < 21) return 'Good evening';
  return 'Good night';
}

function setHomeState() {
  const b3 = document.getElementById('card-b3');
  const b4 = document.getElementById('card-b4');
  const b6 = document.getElementById('card-b6');

  if (isGuest) {
    b3.classList.add('grayed');
    b4.classList.add('grayed');
    b6.classList.add('grayed');
    const _baraCard = document.getElementById('card-bara');
    const _baraNote = document.getElementById('bara-sub-note');
    if (_baraCard) { _baraCard.classList.add('grayed'); if (_baraNote) _baraNote.style.display = 'block'; }
    document.getElementById('home-greeting').textContent = 'Welcome, Guest';
  } else {
    b3.classList.remove('grayed');
    b4.classList.remove('grayed');
    // Personal portal: column C = X (hasPortal)
    if (currentHasPortal) {
      b6.classList.remove('grayed');
    } else {
      b6.classList.add('grayed');
    }
    // Bara: column G = X (hasBara)
    const baraCard = document.getElementById('card-bara');
    const baraNote = document.getElementById('bara-sub-note');
    if (baraCard) {
      if (currentHasBara) {
        baraCard.classList.remove('grayed');
        if (baraNote) baraNote.style.display = 'none';
        const baraNote2 = document.getElementById('bara-sub-note2');
        if (baraNote2) baraNote2.style.display = 'none';
      } else {
        baraCard.classList.add('grayed');
        if (baraNote) baraNote.style.display = 'block';
        const baraNote2 = document.getElementById('bara-sub-note2');
        if (baraNote2) baraNote2.style.display = 'block';
      }
    }
    document.getElementById('home-greeting').textContent = getTimeGreeting() + ', ' + currentUserName;
  }

  // Gate fengshui tools
  applyFsSubscriberGating();
  // Gate tier-based features
  applyTierGating();

  // Visit counter (localStorage)
  let visits = parseInt(localStorage.getItem('go_portal_visits') || '0') + 1;
  localStorage.setItem('go_portal_visits', visits);
  document.getElementById('visit-count').textContent = visits.toLocaleString() + ' visits';
}

function applyTierGating() {
  // "See what Lot says" — grayed for Tier 3 and guests
  const linkEl = document.getElementById('kw-lot-link');
  const noteEl = document.getElementById('kw-tier-note');
  const canSeeLink = !isGuest && (currentTier === 1 || currentTier === 2);
  if (linkEl) {
    linkEl.style.pointerEvents = canSeeLink ? 'auto' : 'none';
    linkEl.style.opacity = canSeeLink ? '1' : '0.3';
    linkEl.style.cursor = canSeeLink ? 'pointer' : 'default';
  }
  if (noteEl) noteEl.style.display = canSeeLink ? 'none' : 'block';
}

function applyFsSubscriberGating() {
  // Cards inside B4 screen that require FS (ii) Shage subscription
  const fsToolCards = document.querySelectorAll('.fs-tool-gated');
  const fsNote = document.querySelectorAll('.fs-subscriber-note');
  if (!isGuest && currentFsSubscriber) {
    fsToolCards.forEach(el => el.classList.remove('grayed'));
    fsNote.forEach(el => el.style.display = 'none');
  } else {
    fsToolCards.forEach(el => el.classList.add('grayed'));
    fsNote.forEach(el => el.style.display = 'block');
  }
}

function openPersonalPortal() {
  if (!isGuest && currentUser) {
    window.open('https://sites.google.com/view/fsvi' + currentUser.toLowerCase(), '_blank');
  }
}

document.addEventListener('keydown', function(e) {
  const inp = document.getElementById('idInput');
  if (inp && inp.style.display === 'block' && e.key === 'Enter') loginWithId();
});

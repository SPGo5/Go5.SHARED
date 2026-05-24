// ============================================================
// SPGo Super Portal — Core Frontend Script
// ============================================================

const GAS_URL = "https://script.google.com/macros/s/AKfycbzA_YOUR_ACTUAL_ID_HERE/exec";

let currentUser = null;
let currentUserName = null;
let currentFsSubscriber = false;
let currentHasPortal = false;
let currentHasBara = false;
let currentTier = 0;
let isGuest = true;

// ── INITIALIZATION & ROUTING ──
window.addEventListener('DOMContentLoaded', () => {
  // Handle layout adjustments for viewport heights
  const vh = window.innerHeight * 00.1;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
  
  // Attach Event Listeners to UI Elements safely
  const loginBtn = document.getElementById('btn-google-login');
  if (loginBtn) {
    loginBtn.addEventListener('click', handleGoogleLogin);
  }
  
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  // Restore session from cache if available
  try {
    const saved = localStorage.getItem('go_saved_user');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.savedAt && (Date.now() - parsed.savedAt < 7 * 24 * 60 * 60 * 1000)) {
        currentUser = parsed.user;
        currentUserName = parsed.name;
        currentFsSubscriber = parsed.fs === true;
        currentHasPortal = parsed.portal === true;
        currentHasBara = parsed.hasBara === true;
        currentTier = parsed.tier || 0;
        isGuest = false;
        
        setHomeState();
        updateProfileCorner();
        goTo('screen-B0');
        return;
      }
    }
  } catch(e) { console.error('Session restoration skipped:', e); }

  handleOAuthCallback();
});

function goTo(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) target.classList.add('active');
}

function showLoginError(msg) {
  const errDiv = document.getElementById('login-error-msg');
  if (errDiv) {
    errDiv.textContent = msg;
    errDiv.style.display = 'block';
  } else {
    alert(msg);
  }
}

// ── OAUTH INITIATION ──
function handleGoogleLogin() {
  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth' +
    '?client_id=' + encodeURIComponent('427989206862-svhf1cote22nhdhkq68ff14446upp2m4.apps.googleusercontent.com') +
    '&redirect_uri=' + encodeURIComponent(window.location.href.split('#')[0]) +
    '&response_type=token' +
    '&scope=' + encodeURIComponent('https://www.googleapis.com/auth/userinfo.email');
  
  window.location.href = authUrl;
}

function handleOAuthCallback() {
  const hash = window.location.hash;
  if (!hash) return;

  const params = new URLSearchParams(hash.replace('#', '?'));
  const accessToken = params.get('access_token');
  
  if (accessToken) {
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    validateWithToken(accessToken);
  }
}

// ── SURGICAL FIX: NATIVE FETCH REPLACEMENT FOR VALIDATION ──
async function validateWithToken(token) {
  if (typeof showVerifying === 'function') {
    showVerifying();
  } else {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const verifyScreen = document.getElementById('screen-B0-verify');
    if (verifyScreen) verifyScreen.classList.add('active');
  }

  try {
    // 1. Get email payload directly from Google identity endpoint
    const infoResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!infoResp.ok) throw new Error('Identity payload fetch failed');
    const userInfo = await infoResp.json();
    const email = userInfo.email;

    if (!email) {
      goTo('screen-B0-login');
      showLoginError('Could not get your email from Google. Please try again.');
      return;
    }

    // 2. Direct network request to Web App backend (bypasses broken browser tracking rules)
    const targetUrl = GAS_URL + '?action=validateEmail&email=' + encodeURIComponent(email);
    const response = await fetch(targetUrl);
    if (!response.ok) throw new Error('Database server infrastructure unreachable');
    const data = await response.json();

    // 3. Process backend return mapping flags natively
    if (data && data.valid === true) {
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
        sessionStorage.removeItem('go_pending_token');
      } catch(e) {}
      
      setHomeState();
      updateProfileCorner();
      goTo('screen-B0');
    } else {
      goTo('screen-B0-login');
      showLoginError('Your account (' + email + ') is not registered. Please contact your administrator.');
    }
  } catch(e) {
    console.error('Core routing exception trace:', e);
    goTo('screen-B0-login');
    showLoginError('Connection error. Check your internet and try again.');
  }
}

// ── CORE INTERFACE STATE FLAGS ──
function setHomeState() {
  console.log("Portal UI dashboard populated for user: " + currentUserName);
}

function updateProfileCorner() {
  const profileDiv = document.getElementById('user-profile-display');
  if (profileDiv) {
    profileDiv.textContent = currentUserName || "Member";
  }
}

function handleLogout() {
  try {
    localStorage.removeItem('go_saved_user');
  } catch(e) {}
  window.location.reload();
}

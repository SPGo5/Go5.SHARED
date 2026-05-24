// ============================================================
// SPGo Super Portal — Core Frontend Script
// Handles routing, Google OAuth authentication, and database validation
// ============================================================

let currentUser = null;
let currentUserName = null;
let currentFsSubscriber = false;
let currentHasPortal = false;
let currentHasBara = false;
let currentTier = 0;
let isGuest = true;

// Utility function to handle screen switching
function goTo(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) target.classList.add('active');
}

// Utility function to display errors on the login interface
function showLoginError(msg) {
  const errDiv = document.getElementById('login-error-msg');
  if (errDiv) {
    errDiv.textContent = msg;
    errDiv.style.display = 'block';
  } else {
    alert(msg);
  }
}

// Global initialization logic on page load
window.addEventListener('DOMContentLoaded', () => {
  // Check if a user session is already saved locally to bypass login login screen
  try {
    const saved = localStorage.getItem('go_saved_user');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Ensure the saved session is fresh (less than 7 days old)
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
  } catch(e) { console.error('Error reading saved session:', e); }

  // Check if we are currently returning from an OAuth redirection loop
  handleOAuthCallback();
});

// Capture hash parameters from Google OAuth redirection
function handleOAuthCallback() {
  const hash = window.location.hash;
  if (!hash) return;

  const params = new URLSearchParams(hash.replace('#', '?'));
  const accessToken = params.get('access_token');
  
  if (accessToken) {
    // Clean up URL address bar tracking parameters completely
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    // Execute server-side registration checks with our newly acquired token
    validateWithToken(accessToken);
  }
}

// Trigger standard OAuth redirection flow when login button is pressed
function handleGoogleLogin() {
  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth' +
    '?client_id=' + encodeURIComponent('427989206862-svhf1cote22nhdhkq68ff14446upp2m4.apps.googleusercontent.com') +
    '&redirect_uri=' + encodeURIComponent(window.location.href.split('#')[0]) +
    '&response_type=token' +
    '&scope=' + encodeURIComponent('https://www.googleapis.com/auth/userinfo.email');
  
  window.location.href = authUrl;
}

// ── REPLACED VALIDATION LOGIC: Direct connection via Fetch to bypass 302 breaks ──
async function validateWithToken(token) {
  // Trigger UI loading indicators
  if (typeof showVerifying === 'function') {
    showVerifying();
  } else {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const verifyScreen = document.getElementById('screen-B0-verify');
    if (verifyScreen) verifyScreen.classList.add('active');
  }

  try {
    // 1. Fetch user profile identity payload down from Google API directly
    const infoResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + token }
    });
    
    if (!infoResp.ok) throw new Error('Failed to retrieve user profile metadata from Google');
    const userInfo = await infoResp.json();
    const email = userInfo.email;

    if (!email) {
      goTo('screen-B0-login');
      showLoginError('Could not retrieve your verified email address from Google. Try again.');
      return;
    }

    // 2. Transmit email validation check securely to existing Apps Script Web App endpoint
    const targetUrl = GAS_URL + '?action=validateEmail&email=' + encodeURIComponent(email);
    
    const response = await fetch(targetUrl);
    if (!response.ok) throw new Error('Database server infrastructure returned a validation error status');
    
    const data = await response.json();

    // 3. Process database permissions profile mapping flags natively
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
          user: currentUser, 
          name: currentUserName,
          fs: currentFsSubscriber, 
          portal: currentHasPortal,
          hasBara: currentHasBara, 
          tier: currentTier,
          email: email, 
          savedAt: Date.now()
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
    console.error('System validation exception traces:', e);
    goTo('screen-B0-login');
    showLoginError('Connection error. Check your internet connection and try again.');
  }
}

// Fallback user session clearing handling
function handleLogout() {
  try {
    localStorage.removeItem('go_saved_user');
  } catch(e) {}
  window.location.reload();
}

const UM_SESSION_KEY = 'ultramax_remembered_setup';

function umIsStandalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
  } catch (e) {
    return false;
  }
}

function umSaveSession(token, password) {
  try {
    localStorage.setItem(UM_SESSION_KEY, JSON.stringify({
      token: token,
      password: password || null,
      savedAt: Date.now()
    }));
  } catch (e) {
    console.log('Could not save Ultra MAX session:', e);
  }
}

function umGetSession() {
  try {
    const raw = localStorage.getItem(UM_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function umClearSession() {
  try {
    localStorage.removeItem(UM_SESSION_KEY);
  } catch (e) {}
}

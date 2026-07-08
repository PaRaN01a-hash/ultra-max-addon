const NUVIO_API_BASE = 'https://api.nuvio.tv';
const NUVIO_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgxNTIxMzQ2LCJleHAiOjE5MzkyMDEzNDZ9.tmQaj682pwzehpqlgCDMnySOqiUvpgRbrE43T4VJpDI';

function nuvioHeaders(accessToken) {
  const headers = { 'apikey': NUVIO_ANON_KEY, 'Content-Type': 'application/json', 'X-Client-Info': 'UltraMAX/1.0' };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  return headers;
}

async function nuvioFetch(url, options, actionLabel) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (networkErr) {
    throw new Error(
      `Couldn't reach Nuvio while trying to ${actionLabel} (network/CORS error). ` +
      `This can happen on some TV browsers or if you're offline. Try again on a phone/desktop browser. ` +
      `[${networkErr.message || networkErr}]`
    );
  }

  if (!res.ok) {
    let bodyText = '';
    let bodyJson = null;
    try {
      bodyText = await res.text();
      bodyJson = JSON.parse(bodyText);
    } catch {}

    const serverMsg = bodyJson?.error_description || bodyJson?.msg || bodyJson?.message || bodyText;

    if (res.status === 401 || res.status === 403) {
      throw new Error(`Login failed while trying to ${actionLabel} (${res.status}). Check your Nuvio email and password.`);
    }

    throw new Error(
      `Nuvio returned an error while trying to ${actionLabel} (HTTP ${res.status}). ` +
      (serverMsg ? `Details: ${serverMsg}` : 'No further details were provided.')
    );
  }

  return res;
}

async function nuvioLogin(email, password) {
  const res = await nuvioFetch(
    `${NUVIO_API_BASE}/auth/v1/token?grant_type=password`,
    { method: 'POST', headers: nuvioHeaders(), body: JSON.stringify({ email, password }) },
    'log in'
  );
  const data = await res.json();
  return { accessToken: data.access_token, refreshToken: data.refresh_token, userId: data.user?.id };
}

async function nuvioRefreshSession(refreshToken) {
  const res = await nuvioFetch(
    `${NUVIO_API_BASE}/auth/v1/token?grant_type=refresh_token`,
    { method: 'POST', headers: nuvioHeaders(), body: JSON.stringify({ refresh_token: refreshToken }) },
    'restore your saved Nuvio session'
  );
  const data = await res.json();
  return { accessToken: data.access_token, refreshToken: data.refresh_token, userId: data.user?.id };
}

const NUVIO_SESSION_STORAGE_KEY = 'ultramax_nuvio_session';

function nuvioSaveSession(refreshToken) {
  try {
    localStorage.setItem(NUVIO_SESSION_STORAGE_KEY, JSON.stringify({ refreshToken, savedAt: Date.now() }));
  } catch (e) {
    console.log('Could not save Nuvio session:', e);
  }
}

function nuvioClearSession() {
  try { localStorage.removeItem(NUVIO_SESSION_STORAGE_KEY); } catch (e) {}
}

function nuvioGetSavedRefreshToken() {
  try {
    const raw = localStorage.getItem(NUVIO_SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw).refreshToken || null;
  } catch (e) {
    return null;
  }
}

async function nuvioTryRestoreSession() {
  const refreshToken = nuvioGetSavedRefreshToken();
  if (!refreshToken) return null;
  try {
    const { accessToken, refreshToken: newRefreshToken } = await nuvioRefreshSession(refreshToken);
    nuvioSaveSession(newRefreshToken);
    const profiles = await nuvioGetAllProfiles(accessToken);
    return { accessToken, profiles };
  } catch (e) {
    nuvioClearSession();
    return null;
  }
}

async function nuvioGetAllProfiles(accessToken) {
  const res = await nuvioFetch(
    `${NUVIO_API_BASE}/rest/v1/rpc/sync_pull_profiles`,
    { method: 'POST', headers: nuvioHeaders(accessToken), body: JSON.stringify({}) },
    'load your Nuvio profiles'
  );
  const profiles = await res.json();
  if (!profiles || profiles.length === 0) throw new Error('No Nuvio profile found on this account.');
  return profiles;
}

async function nuvioGetAddons(accessToken, profileId) {
  const res = await nuvioFetch(
    `${NUVIO_API_BASE}/rest/v1/addons?select=*&profile_id=eq.${profileId}&order=sort_order`,
    { headers: nuvioHeaders(accessToken) },
    'fetch your existing addons'
  );
  return res.json();
}

async function nuvioGetCollections(accessToken, profileId) {
  const res = await nuvioFetch(
    `${NUVIO_API_BASE}/rest/v1/rpc/sync_pull_collections`,
    { method: 'POST', headers: nuvioHeaders(accessToken), body: JSON.stringify({ p_profile_id: profileId }) },
    'fetch your existing collections'
  );
  const rows = await res.json();
  return rows?.[0]?.collections_json || [];
}

async function nuvioPushAddons(accessToken, profileId, addons) {
  const payload = addons.map((a, i) => ({ url: a.url, name: a.name, enabled: a.enabled !== false, sort_order: i }));
  await nuvioFetch(
    `${NUVIO_API_BASE}/rest/v1/rpc/sync_push_addons`,
    { method: 'POST', headers: nuvioHeaders(accessToken), body: JSON.stringify({ p_profile_id: profileId, p_addons: payload }) },
    'push your addon to Nuvio'
  );
}

async function nuvioPushCollections(accessToken, profileId, collections) {
  await nuvioFetch(
    `${NUVIO_API_BASE}/rest/v1/rpc/sync_push_collections`,
    { method: 'POST', headers: nuvioHeaders(accessToken), body: JSON.stringify({ p_profile_id: profileId, p_collections_json: collections }) },
    'push your collections to Nuvio'
  );
}

async function nuvioPushProfiles(accessToken, profiles, clientMaxProfiles) {
  const payload = profiles.map(p => ({
    profile_index: p.profile_index, name: p.name, avatar_color_hex: p.avatar_color_hex,
    uses_primary_addons: p.uses_primary_addons, uses_primary_plugins: p.uses_primary_plugins,
    avatar_id: p.avatar_id, avatar_url: p.avatar_url
  }));
  await nuvioFetch(
    `${NUVIO_API_BASE}/rest/v1/rpc/sync_push_profiles`,
    { method: 'POST', headers: nuvioHeaders(accessToken), body: JSON.stringify({ p_client_max_profiles: clientMaxProfiles || profiles.length, p_profiles: payload }) },
    'update your profile avatar on Nuvio'
  );
}

async function nuvioSetProfileAvatar(accessToken, profiles, profileId, newAvatarUrl) {
  const updated = profiles.map(p => p.profile_index === profileId ? { ...p, avatar_url: newAvatarUrl } : p);
  await nuvioPushProfiles(accessToken, updated, profiles.length);
  return updated;
}

async function nuvioLoginAndListProfiles(email, password) {
  const { accessToken, refreshToken } = await nuvioLogin(email, password);
  const profiles = await nuvioGetAllProfiles(accessToken);
  return { accessToken, refreshToken, profiles };
}

async function pushUltraMaxToProfile(accessToken, profileId, options, onStatus) {
  const status = onStatus || (() => {});
  const { manifestUrl, collections, pushCatalogs, pushCollections } = options;
  if (!pushCatalogs && !pushCollections) {
    throw new Error('Select at least one of Catalogs or Collections to push.');
  }
  if (pushCatalogs) {
    status('Fetching your current addons...');
    const existingAddons = await nuvioGetAddons(accessToken, profileId);
    const filteredAddons = existingAddons.filter(a => a.url !== manifestUrl);
    const mergedAddons = [{ url: manifestUrl, name: 'Ultra MAX', enabled: true }, ...filteredAddons];
    status('Pushing addon to Nuvio...');
    await nuvioPushAddons(accessToken, profileId, mergedAddons);
  }
  if (pushCollections && collections && collections.length > 0) {
    status('Fetching your current collections...');
    const existingCollections = await nuvioGetCollections(accessToken, profileId);
    const newIds = new Set(collections.map(c => c.id));
    const filteredCollections = existingCollections.filter(c => !newIds.has(c.id));
    const mergedCollections = [...filteredCollections, ...collections];
    status('Pushing collections to Nuvio...');
    await nuvioPushCollections(accessToken, profileId, mergedCollections);
  }
  status('Done! Ultra MAX is now live in your Nuvio account.');
}

async function pushUltraMaxToProfiles(accessToken, profileIds, options, onStatus) {
  const status = onStatus || (() => {});
  const results = [];

  for (let i = 0; i < profileIds.length; i++) {
    const profileId = profileIds[i];
    const prefix = `(${i + 1}/${profileIds.length}) `;
    try {
      await pushUltraMaxToProfile(accessToken, profileId, options, (msg) => {
        status(prefix + msg);
      });
      results.push({ profileId, ok: true });
    } catch (err) {
      results.push({ profileId, ok: false, error: err.message || String(err) });
    }
  }

  const failures = results.filter(r => !r.ok);
  if (failures.length === 0) {
    status(`Done! Pushed to all ${profileIds.length} profile${profileIds.length === 1 ? '' : 's'}.`);
  } else if (failures.length === results.length) {
    status(`Failed to push to any profile. First error: ${failures[0].error}`);
  } else {
    status(`Pushed to ${results.length - failures.length}/${results.length} profiles. ${failures.length} failed — check console for details.`);
    console.log('Ultra MAX multi-push failures:', failures);
  }

  return results;
}

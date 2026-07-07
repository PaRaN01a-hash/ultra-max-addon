const NUVIO_API_BASE = 'https://api.nuvio.tv';
const NUVIO_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgxNTIxMzQ2LCJleHAiOjE5MzkyMDEzNDZ9.tmQaj682pwzehpqlgCDMnySOqiUvpgRbrE43T4VJpDI';

function nuvioHeaders(accessToken) {
  const headers = { 'apikey': NUVIO_ANON_KEY, 'Content-Type': 'application/json', 'X-Client-Info': 'UltraMAX/1.0' };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  return headers;
}

async function nuvioLogin(email, password) {
  const res = await fetch(`${NUVIO_API_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: nuvioHeaders(), body: JSON.stringify({ email, password })
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error_description || errBody.msg || 'Login failed. Check your email and password.');
  }
  const data = await res.json();
  return { accessToken: data.access_token, userId: data.user?.id };
}

async function nuvioGetAllProfiles(accessToken) {
  const res = await fetch(`${NUVIO_API_BASE}/rest/v1/rpc/sync_pull_profiles`, {
    method: 'POST', headers: nuvioHeaders(accessToken), body: JSON.stringify({})
  });
  if (!res.ok) throw new Error('Could not load your Nuvio profiles.');
  const profiles = await res.json();
  if (!profiles || profiles.length === 0) throw new Error('No Nuvio profile found on this account.');
  return profiles;
}

async function nuvioGetAddons(accessToken, profileId) {
  const res = await fetch(`${NUVIO_API_BASE}/rest/v1/addons?select=*&profile_id=eq.${profileId}&order=sort_order`, { headers: nuvioHeaders(accessToken) });
  if (!res.ok) throw new Error('Could not load your existing addons.');
  return res.json();
}

async function nuvioGetCollections(accessToken, profileId) {
  const res = await fetch(`${NUVIO_API_BASE}/rest/v1/rpc/sync_pull_collections`, {
    method: 'POST', headers: nuvioHeaders(accessToken), body: JSON.stringify({ p_profile_id: profileId })
  });
  if (!res.ok) throw new Error('Could not load your existing collections.');
  const rows = await res.json();
  return rows?.[0]?.collections_json || [];
}

async function nuvioPushAddons(accessToken, profileId, addons) {
  const payload = addons.map((a, i) => ({ url: a.url, name: a.name, enabled: a.enabled !== false, sort_order: i }));
  const res = await fetch(`${NUVIO_API_BASE}/rest/v1/rpc/sync_push_addons`, {
    method: 'POST', headers: nuvioHeaders(accessToken), body: JSON.stringify({ p_profile_id: profileId, p_addons: payload })
  });
  if (!res.ok) throw new Error('Failed to push addons to Nuvio.');
}

async function nuvioPushCollections(accessToken, profileId, collections) {
  const res = await fetch(`${NUVIO_API_BASE}/rest/v1/rpc/sync_push_collections`, {
    method: 'POST', headers: nuvioHeaders(accessToken), body: JSON.stringify({ p_profile_id: profileId, p_collections_json: collections })
  });
  if (!res.ok) throw new Error('Failed to push collections to Nuvio.');
}

async function nuvioPushProfiles(accessToken, profiles, clientMaxProfiles) {
  const payload = profiles.map(p => ({
    profile_index: p.profile_index,
    name: p.name,
    avatar_color_hex: p.avatar_color_hex,
    uses_primary_addons: p.uses_primary_addons,
    uses_primary_plugins: p.uses_primary_plugins,
    avatar_id: p.avatar_id,
    avatar_url: p.avatar_url
  }));
  const res = await fetch(`${NUVIO_API_BASE}/rest/v1/rpc/sync_push_profiles`, {
    method: 'POST', headers: nuvioHeaders(accessToken),
    body: JSON.stringify({ p_client_max_profiles: clientMaxProfiles || profiles.length, p_profiles: payload })
  });
  if (!res.ok) throw new Error('Failed to update profile avatar on Nuvio.');
}

async function nuvioSetProfileAvatar(accessToken, profiles, profileId, newAvatarUrl) {
  const updated = profiles.map(p => p.profile_index === profileId ? { ...p, avatar_url: newAvatarUrl } : p);
  await nuvioPushProfiles(accessToken, updated, profiles.length);
  return updated;
}

async function nuvioLoginAndListProfiles(email, password) {
  const { accessToken } = await nuvioLogin(email, password);
  const profiles = await nuvioGetAllProfiles(accessToken);
  return { accessToken, profiles };
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

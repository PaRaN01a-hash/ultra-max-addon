const { fetchCached } = require("./api-helpers");

const STREAM_BRIDGE_TIMEOUT_MS = 8000;

function normaliseManifestUrl(url) {
  if (!url) return null;
  let u = String(url).trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  // Support both:
  // https://host/config/manifest.json
  // https://host/configmanifest.json
  if (/manifest\.json(?:\?.*)?$/i.test(u) && !/\/manifest\.json(?:\?.*)?$/i.test(u)) {
    u = u.replace(/manifest\.json(?:\?.*)?$/i, "/manifest.json");
  }

  if (!/\/manifest\.json(?:\?.*)?$/i.test(u)) return null;
  return u;
}

function streamUrlFromManifest(manifestUrl, type, id) {
  return manifestUrl.replace(/\/manifest\.json(?:\?.*)?$/i, `/stream/${type}/${id}.json`);
}

async function fetchStreamAddonName(manifestUrl) {
  try {
    const m = await fetchCached(manifestUrl);
    return m && m.name ? String(m.name).trim() : "External";
  } catch (e) {
    return "External";
  }
}

async function fetchStreamsFromAddon(manifestUrl, type, id) {
  const cleanManifest = normaliseManifestUrl(manifestUrl);
  if (!cleanManifest) return [];

  const url = streamUrlFromManifest(cleanManifest, type, id);
  const addonName = await fetchStreamAddonName(cleanManifest);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STREAM_BRIDGE_TIMEOUT_MS);

  try {
    console.log("STREAM BRIDGE CALL", url);
    const resp = await fetch(url, { signal: controller.signal });
    console.log("STREAM BRIDGE STATUS", resp.status, url);
    if (!resp.ok) return [];

    const data = await resp.json();
    const streams = Array.isArray(data.streams) ? data.streams : [];

    return streams.map(stream => ({
      ...stream
    }));
  } catch (e) {
    console.log("STREAM BRIDGE ERROR", e.message, url);
    return [];
  } finally {
    clearTimeout(timer);
  }
}


function streamQualityScore(stream) {
  const nameText = String(stream.name || '').toLowerCase();
  const text = ((stream.name || '') + ' ' + (stream.title || '') + ' ' + (stream.description || '')).toLowerCase();
  const resolutionText = nameText || text;

  let score = 0;
  if (resolutionText.includes('2160') || resolutionText.includes('4k') || resolutionText.includes('uhd')) score += 4000;
  else if (resolutionText.includes('1080')) score += 3000;
  else if (resolutionText.includes('720')) score += 2000;
  else if (resolutionText.includes('480')) score += 1000;

  if (text.includes('remux')) score += 40;
  if (text.includes('hdr') || text.includes('dolby vision') || text.includes('dv')) score += 25;
  if (text.includes('bluray') || text.includes('blu-ray')) score += 20;
  if (text.includes('web-dl') || text.includes('webrip')) score += 10;

  if (text.includes('cam') || text.includes('ts') || text.includes('telesync')) score -= 500;
  if (text.includes('scr')) score -= 250;

  const size = stream.behaviorHints && stream.behaviorHints.videoSize ? Number(stream.behaviorHints.videoSize) : 0;
  if (size) score += Math.min(60, Math.floor(size / (1024 * 1024 * 1024)));

  return score;
}

function cleanStreamLabel(name) {
  return String(name || '')
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, ' ')
    .trim();
}


function cleanTitle(t){
  return String(t || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isProbablySameTitle(a, b){
  const t1 = cleanTitle(a);
  const t2 = cleanTitle(b);

  if (!t1 || !t2) return true;

  // quick contain check
  if (t1.includes(t2) || t2.includes(t1)) return true;

  // basic word overlap
  const words1 = t1.split(' ');
  const words2 = t2.split(' ');

  const overlap = words1.filter(w => words2.includes(w)).length;

  return overlap >= Math.min(3, words2.length);
}

function sortAndLimitStreams(streams, limit = 30) {
  return streams
    .map(s => ({ ...s, _score: streamQualityScore(s) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(({ _score, ...s }) => s);
}


function hardenStreamForNuvio(stream){
  const title = String(stream.title || stream.description || "");
  const name = String(stream.name || "");
  const filename = String(stream.behaviorHints?.filename || "");
  const size = Number(stream.behaviorHints?.videoSize || 0);

  const text = `${name}\n${title}\n${filename}`.toLowerCase();

  const fragile =
    text.includes("stremthru") ||
    text.includes("remux") ||
    size > 45 * 1024 * 1024 * 1024;

  return {
    ...stream,
    behaviorHints: {
      ...(stream.behaviorHints || {}),
      notWebReady: false,
      fragilePlayback: fragile
    },
    headers: {
      ...(stream.headers || {}),
      "User-Agent": "VLC/3.0.20 LibVLC/3.0.20",
      "Referer": "https://aiostreams.elfhosted.com/",
      "Origin": "https://aiostreams.elfhosted.com"
    },
    _ultraFragile: fragile
  };
}

function streamRankForNuvio(s){
  const text = String(`${s.name || ""}\n${s.title || ""}\n${s.description || ""}\n${s.behaviorHints?.filename || ""}`).toLowerCase();
  const size = Number(s.behaviorHints?.videoSize || 0);
  const gb = size / 1024 / 1024 / 1024;

  let score = 0;

  if (text.includes("1080p")) score += 100;
  if (text.includes("2160p") || text.includes("4k")) score += 85;
  if (text.includes("720p")) score += 65;

  if (gb >= 2 && gb <= 18) score += 80;
  else if (gb > 18 && gb <= 35) score += 45;
  else if (gb > 35 && gb <= 50) score += 10;
  else if (gb > 50) score -= 80;
  else if (gb > 0 && gb < 1) score -= 15;

  if (text.includes("remux")) score -= 60;
  if (text.includes("stremthru")) score -= 40;

  return score;
}

function sortNuvioFriendlyStreams(a, b){
  if (!!a._ultraFragile !== !!b._ultraFragile) return a._ultraFragile ? 1 : -1;
  return streamRankForNuvio(b) - streamRankForNuvio(a);
}

async function streamBridgeResponse(streamAddons, type, id) {
  const addons = (streamAddons || [])
    .map(normaliseManifestUrl)
    .filter(Boolean)
    .slice(0, 8);

  if (!addons.length) return { streams: [] };

  const results = await Promise.allSettled(
    addons.map(url => fetchStreamsFromAddon(url, type, id))
  );

  const streams = results.flatMap(r => r.status === "fulfilled" ? r.value : []);

  // Basic dedupe by URL/infoHash/title
  const seen = new Set();
  const deduped = [];
  for (const s of streams) {
    const key = s.url || s.infoHash || s.externalUrl || s.title || JSON.stringify(s).slice(0, 200);
    if (seen.has(key)) continue;
    seen.add(key);

deduped.push(s);
  }

  const hardened = deduped
    .map(hardenStreamForNuvio)
    .sort(sortNuvioFriendlyStreams)
    .map(({ _ultraFragile, ...stream }) => stream);

  return { streams: hardened.slice(0, 30) };
}

module.exports = {
  streamBridgeResponse
};

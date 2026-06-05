const fs = require("fs");
const path = require("path");

const CONFIGS_FILE = path.join(__dirname, "..", "configs.json");

let CONFIG_CACHE = null;
let CONFIG_CACHE_MTIME = 0;

function loadConfigs() {
  try {
    const stat = fs.statSync(CONFIGS_FILE);
    const mtime = stat.mtimeMs;

    if (CONFIG_CACHE && CONFIG_CACHE_MTIME === mtime) {
      return CONFIG_CACHE;
    }

    CONFIG_CACHE = JSON.parse(fs.readFileSync(CONFIGS_FILE, "utf8"));
    CONFIG_CACHE_MTIME = mtime;
    return CONFIG_CACHE;
  } catch (e) {
    return {};
  }
}

let configWriteQueue = Promise.resolve();

function saveConfigs(c) {
  configWriteQueue = configWriteQueue.then(() => {
    try {
      fs.writeFileSync(CONFIGS_FILE, JSON.stringify(c, null, 2));
      const stat = fs.statSync(CONFIGS_FILE);
      CONFIG_CACHE = c;
      CONFIG_CACHE_MTIME = stat.mtimeMs;
    } catch(e) {
      console.error("saveConfigs error:", e.message);
    }
  });
}

module.exports = {
  loadConfigs,
  saveConfigs
};

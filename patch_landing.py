import os

def patch_landing_page():
    html_filename = "index.html"
    
    if not os.path.exists(html_filename):
        print(f"Error: {html_filename} not found in the current directory.")
        return

    # 1. Read the existing index.html content
    with open(html_filename, "r", encoding="utf-8") as f:
        content = f.read()

    # 2. Define the exact target block to find
    target_start = '<section class="services" id="services">'
    target_end = '<section class="trending-section">'

    if target_start not in content or target_end not in content:
        print("Error: Could not locate the target layout section in index.html.")
        return

    # 3. Define the new ecosystem chunk code
    new_services_html = """<section class="services" id="services">
    <div class="section-label">The Ecosystem</div>
    <div class="section-title">ONE ENGINE. TOTAL CONTROL.</div>

    <!-- Interactive Performance Toggles -->
    <div style="background: var(--bg2); border: 1px solid var(--border); border-radius: 14px; padding: 20px; margin-bottom: 40px; text-align: center;">
      <p style="font-size: 0.85rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px;">Compare Infrastructure</p>
      <div style="display: flex; justify-content: center; gap: 10px; flex-wrap: wrap;">
        <button type="button" onclick="switchTab('cinema')" class="btn btn-ghost" id="tab-cinema" style="border-color: var(--violet); color: var(--white); padding: 8px 16px; font-size: 0.8rem; cursor: pointer;">⚡ Cinema Engine</button>
        <button type="button" onclick="switchTab('tv')" class="btn btn-ghost" id="tab-tv" style="padding: 8px 16px; font-size: 0.8rem; cursor: pointer; border-color: transparent;">📺 Live TV Logic</button>
        <button type="button" onclick="switchTab('music')" class="btn btn-ghost" id="tab-music" style="padding: 8px 16px; font-size: 0.8rem; cursor: pointer; border-color: transparent;">🎵 MaxMusic Sonic</button>
      </div>
      
      <!-- Dynamic Spec Sheet Block -->
      <div id="tab-content" style="margin-top: 20px; font-size: 0.85rem; color: var(--muted); border-top: 1px solid var(--border); padding-top: 16px; min-height: 50px;">
        <strong>Core Advantage:</strong> Cleansed metadata scraping removes movie result duplication and eliminates search dilution instantly.
      </div>
    </div>

    <!-- Active User Counter Bar -->
    <div class="stats-bar">
      <div class="stat-item">
        <span class="stat-num" id="userCount">5,000+</span>
        <span class="stat-label">Active Installs</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <span class="stat-num">240+</span>
        <span class="stat-label">Smart Catalogs</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <span class="stat-num">560+</span>
        <span class="stat-label">Live Channels</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <span class="stat-num">Free</span>
        <span class="stat-label">Always</span>
      </div>
    </div>

    <!-- PILLAR 1: THE CORE ECOSYSTEM (3 Columns) -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; margin-bottom: 56px;">
      
      <!-- Core Cinema Card -->
      <a class="card" href="/setup.html">
        <div class="card-icon violet">⚡</div>
        <span class="card-tag violet">Cinema Layer</span>
        <h3>Ultra MAX Cinema</h3>
        <p>Build your perfect Nuvio home screen. Deep metadata deduplication ensures clean, precise search results with zero clutter or mismatched posters.</p>
        <ul class="card-features violet">
          <li>240+ Curated Smart Catalogs</li>
          <li>Trakt & Simkl Watchlist Sync</li>
          <li>Zero-Dilution Search Filters</li>
          <li>Rated Poster Overlays via RPDB</li>
        </ul>
        <span class="card-cta violet">Deploy Layer →</span>
      </a>

      <!-- Ultra MAX TV -->
      <a class="card" href="/tv.html" target="_blank">
        <div class="card-icon coral">📺</div>
        <span class="card-tag coral">Live Television</span>
        <h3>Ultra MAX TV</h3>
        <p>Hundreds of broadcast channels aggregated into localized guides. High-speed caching means lightning-fast link resolution directly inside your player.</p>
        <ul class="card-features coral">
          <li>560+ Live Regional Channels</li>
          <li>UK, US, AU, IE, IN Profiles</li>
          <li>Optimized Guide Mappings</li>
          <li>Zero Subscription Costs</li>
        </ul>
        <span class="card-cta coral">Inject TV Addon →</span>
      </a>

      <!-- Music Videos -->
      <a class="card" href="/music.html">
        <div class="card-icon teal">🎵</div>
        <span class="card-tag teal">Audio / Visual</span>
        <h3>MaxMusic Engine</h3>
        <p>A dedicated sonic expansion engine. Instantly maps artist profiles, discographies, dynamic playlists, and Last.fm popularity sorting into your layout.</p>
        <ul class="card-features teal">
          <li>29 Curated Video Channels</li>
          <li>Dynamic Artist Fan-Pages</li>
          <li>Last.fm Trend Integration</li>
          <li>Seamless Background Streaming</li>
        </ul>
        <span class="card-cta teal">Inject Music Addon →</span>
      </a>
    </div>

    <!-- PILLAR 2: DEPLOYMENT & CREATION (2 Columns) -->
    <div style="text-align: center; margin-bottom: 24px;">
      <div class="section-label" style="font-size: 0.7rem;">Configuration Suite</div>
      <h4 style="font-family: 'Bebas Neue', sans-serif; font-size: 2rem; color: var(--white); letter-spacing: 0.05em;">BUILD & SHARE TOOLS</h4>
    </div>

    <div class="cards" style="margin-bottom: 56px;">
      <!-- Catalog Builder -->
      <a class="card" href="/builder.html">
        <div class="card-icon">🔨</div>
        <div class="card-badge" style="background:rgba(167,139,250,0.1);color:#a78bfa;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:3px 10px;border-radius:20px;display:inline-block;margin-bottom:10px;">Visual Tool</div>
        <h3>Catalog Customizer</h3>
        <p>Mix your own rules visually. Filter by genre, network, decade, keyword, or actor—preview live metadata responses, then output instantly.</p>
        <ul>
          <li>Live TMDB Sandbox Previews</li>
          <li>Append to Existing Configs</li>
          <li>Export Clean JSON Formats</li>
        </ul>
        <span class="card-cta" style="color:#a78bfa;">Launcher Coming Soon →</span>
      </a>

      <!-- Quick Install Combo -->
      <a class="card" href="/quick.html">
        <div class="card-icon" style="background:rgba(255,180,0,0.12);">⚡</div>
        <span class="card-tag" style="background:rgba(255,180,0,0.12);color:#ffb800;">Instant Delivery</span>
        <h3>One-Click Presets & Gallery</h3>
        <p>Skip the setup entirely. Grab structured community layout profiles or curated template builds and drop them directly into your device.</p>
        <ul class="card-features" style="--dot:#ffb800;">
          <li style="color:var(--muted);">Download pre-cleansed JSON lists</li>
          <li style="color:var(--muted);">Browse user configuration galleries</li>
          <li style="color:var(--muted);">Zero manual parameters required</li>
        </ul>
        <span class="card-cta" style="color:#ffb800;">Access Presets →</span>
      </a>
    </div>

    <!-- PILLAR 3: SUBSYSTEM UTILITIES -->
    <div style="text-align: center; margin-bottom: 24px;">
      <div class="section-label" style="font-size: 0.7rem;">Asset & Environment Control</div>
      <h4 style="font-family: 'Bebas Neue', sans-serif; font-size: 2rem; color: var(--white); letter-spacing: 0.05em;">DASHBOARD COMPONENTS</h4>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-bottom: 56px;">
      <!-- Avatar Vault -->
      <a class="card" href="/avatars.html" style="padding: 24px;">
        <h3 style="font-size: 1.5rem;">Avatar Vault</h3>
        <p style="font-size: 0.85rem; margin-bottom: 16px;">226 premium character assets mapped directly for native Nuvio profiles.</p>
        <span class="card-cta violet" style="font-size: 0.8rem;">Copy URLs →</span>
      </a>

      <!-- Stream Badges -->
      <a class="card" href="/badges.html" style="padding: 24px;">
        <h3 style="font-size: 1.5rem;">Visual Quality Badges</h3>
        <p style="font-size: 0.85rem; margin-bottom: 16px;">Inject 4K, Dolby Vision, Atmos, and language flags directly into raw results.</p>
        <span class="card-cta coral" style="font-size: 0.8rem;">Get Configuration →</span>
      </a>

      <!-- Token Check -->
      <a class="card" href="/token-check.html" style="padding: 24px;">
        <h3 style="font-size: 1.5rem;">Token Diagnostics</h3>
        <p style="font-size: 0.85rem; margin-bottom: 16px;">Verify active script endpoints, check API limits, and run configuration trace loops.</p>
        <span class="card-cta" style="color:#60a5fa; font-size: 0.8rem;">Inspect Token →</span>
      </a>
    </div>
  </section>
"""

    js_patch = """
  <script>
  function switchTab(type) {
    document.getElementById('tab-cinema').style.borderColor = 'transparent';
    document.getElementById('tab-tv').style.borderColor = 'transparent';
    document.getElementById('tab-music').style.borderColor = 'transparent';
    
    document.getElementById('tab-' + type).style.borderColor = 'var(--violet)';
    
    const contentEl = document.getElementById('tab-content');
    if (type === 'cinema') {
      contentEl.innerHTML = `<strong>Core Advantage:</strong> Cleansed metadata scraping removes duplicate search entries and completely eliminates catalog dilution.`;
    } else if (type === 'tv') {
      contentEl.innerHTML = `<strong>TV Edge:</strong> Handles multi-region streams with strict caching, avoiding broken posters and dead loading loops.`;
    } else if (type === 'music') {
      contentEl.innerHTML = `<strong>Audio Backbone:</strong> Directly hooks artist profiles and video indexing without adding overhead to your movie engine.`;
    }
  }
  </script>
</body>"""

    # Extract original part up to services, append new sections, and close with the script patch
    split_parts = content.split(target_start)
    remainder = split_parts[1].split(target_end)
    
    patched_content = split_parts[0] + new_services_html + target_end + remainder[1]
    patched_content = patched_content.replace("</body>", js_patch)

    with open(html_filename, "w", encoding="utf-8") as f:
        f.write(patched_content)

    print("Success: index.html has been patched successfully!")

if __name__ == "__main__":
    patch_landing_page()


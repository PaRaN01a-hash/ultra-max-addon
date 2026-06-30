import os

def remove_duplicate_stats():
    html_filename = "index.html"
    
    if not os.path.exists(html_filename):
        print(f"Error: {html_filename} not found.")
        return

    with open(html_filename, "r", encoding="utf-8") as f:
        content = f.read()

    # This targets the duplicate upper grid layer that sits right above the dynamic stats-bar
    old_duplicate_block = """    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px; margin: 24px 0 40px 0; text-align: center;">
      <div style="background: var(--bg2); border: 1px solid var(--border); padding: 16px; border-radius: 10px;">
        <div style="font-family: 'Bebas Neue', sans-serif; font-size: 1.8rem; color: var(--violet);">240+</div>
        <div style="font-size: 0.75rem; color: var(--muted); text-transform: uppercase;">Catalogs</div>
      </div>
      <div style="background: var(--bg2); border: 1px solid var(--border); padding: 16px; border-radius: 10px;">
        <div style="font-family: 'Bebas Neue', sans-serif; font-size: 1.8rem; color: var(--coral);">560+</div>
        <div style="font-size: 0.75rem; color: var(--muted); text-transform: uppercase;">Live Channels</div>
      </div>
      <div style="background: var(--bg2); border: 1px solid var(--border); padding: 16px; border-radius: 10px;">
        <div style="font-family: 'Bebas Neue', sans-serif; font-size: 1.8rem; color: #10b981;">100%</div>
        <div style="font-size: 0.75rem; color: var(--muted); text-transform: uppercase;">Free</div>
      </div>
      <div style="background: var(--bg2); border: 1px solid var(--border); padding: 16px; border-radius: 10px; display: flex; flex-direction: column; justify-content: center; align-items: center; border-color: var(--violet);">
        <a href="#ecosystem" style="color: var(--white); text-decoration: none; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Explore</a>
      </div>
    </div>"""

    # If the exact inline grid style string is found, strip it out cleanly
    if old_duplicate_block in content:
        content = content.replace(old_duplicate_block, "")
        print("Targeted old static numbers block removed successfully.")
    else:
        # Fallback: manually slice if spaces/tabs differ slightly
        # We find the space between the switcher text block and the dynamic stats-bar
        start_marker = "\n      <div id=\"tab-content\" style=\"margin-top: 20px; font-size: 0.85rem; color: var(--muted); border-top: 1px solid var(--border); padding-top: 16px; min-height: 50px;\">\n        <strong>Core Advantage:</strong> Cleansed metadata scraping removes movie result duplication and eliminates search dilution instantly.\n      </div>\n    </div>"
        end_marker = "\n    <div class=\"stats-bar\">"
        
        if start_marker in content and end_marker in content:
            parts = content.split(start_marker)
            sub_parts = parts[1].split(end_marker)
            content = parts[0] + start_marker + "\n\n    " + end_marker + sub_parts[1]
            print("Fallback cleaner processed: Redundant stats block eliminated.")
        else:
            print("Could not locate the duplicate block pattern. It might already be removed or styled differently.")
            return

    with open(html_filename, "w", encoding="utf-8") as f:
        f.write(content)

if __name__ == "__main__":
    remove_duplicate_stats()


#!/usr/bin/env python3
"""
fix_folder_ui_v2.py — Rebuilds folder card body in setup.html step 3
No JS comments inside string concatenation (that broke v1)
Run from ~/ultramax-landing: python3 fix_folder_ui_v2.py
"""
import shutil, os, sys

SH = os.path.expanduser("~/ultramax-landing/setup.html")
content = open(SH).read()

# Verify anchor exists before touching anything
anchor_start = "          html+='<div class=\"folder-body\">'"
if anchor_start not in content:
    print("ERROR: anchor not found")
    sys.exit(1)

shutil.copy2(SH, SH + '.bak_folderui2')

# Find the exact old block
idx = content.find(anchor_start)
end_marker = "          html+='</div>';\n        }\n        html+='</div>';"
end_idx = content.find(end_marker, idx)
if end_idx == -1:
    print("ERROR: end marker not found")
    sys.exit(1)

old_block = content[idx:end_idx]

new_block = """          html+='<div class=\"folder-body\">'
            +'<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;\">'
            +'<div style=\"background:#0a0a18;border:1px solid #2a2a45;border-radius:8px;padding:10px;\">'
            +'<div style=\"font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#6666aa;margin-bottom:8px;\">Cover Image</div>'
            +(f.coverImageUrl&&f.coverImageUrl.trim()?'<img src="'+f.coverImageUrl+'" style="width:100%;height:80px;object-fit:cover;border-radius:6px;border:1px solid #2a2a45;margin-bottom:8px;" onerror="this.style.display=\\'none\\'">':'<div style="width:100%;height:80px;border-radius:6px;border:1px dashed #2a2a45;display:flex;align-items:center;justify-content:center;font-size:10px;color:#444;margin-bottom:8px;">No cover</div>')
            +'<div style=\"display:flex;gap:6px;\">'
            +'<input type=\"text\" value=\"'+(f.coverImageUrl||'')+'" placeholder="Paste URL\u2026" oninput="updateFolderCover('+i+','+fi+',this.value)" style="flex:1;min-width:0;padding:6px 8px;background:#0d0d1a;color:#e8e8f0;border:1px solid #2a2a45;border-radius:6px;font-size:11px;">'
            +'<button class=\"global-btn\" onclick=\"openAssetLibrary('+i+','+fi+',\\'cover\\')">Browse</button>'
            +'</div></div>'
            +'<div style=\"background:#0a0a18;border:1px solid #2a2a45;border-radius:8px;padding:10px;\">'
            +'<div style=\"display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;\">'
            +'<div style=\"font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#6666aa;\">Focus GIF</div>'
            +'<label style=\"display:flex;align-items:center;gap:5px;cursor:pointer;\"><input type=\"checkbox\" '+(f.focusGifEnabled?'checked':'')+' onchange=\"toggleFolderGif('+i+','+fi+',this.checked)\" style=\"accent-color:#7B2FFF;\"><span style=\"font-size:11px;color:#9898bb;\">On</span></label>'
            +'</div>'
            +(f.focusGifEnabled&&f.focusGifUrl&&f.focusGifUrl.trim()?'<img src="'+f.focusGifUrl+'" style="width:100%;height:80px;object-fit:cover;border-radius:6px;border:1px solid #2a2a45;margin-bottom:8px;" onerror="this.style.display=\\'none\\'">':'<div style="width:100%;height:80px;border-radius:6px;border:1px dashed #2a2a45;display:flex;align-items:center;justify-content:center;font-size:10px;color:#444;margin-bottom:8px;">No GIF</div>')
            +'<div style=\"display:flex;gap:6px;\">'
            +'<input type=\"text\" value=\"'+(f.focusGifUrl||'')+'" placeholder="Paste GIF URL\u2026" oninput="updateFolderGif('+i+','+fi+',this.value)" style="flex:1;min-width:0;padding:6px 8px;background:#0d0d1a;color:#e8e8f0;border:1px solid #2a2a45;border-radius:6px;font-size:11px;">'
            +'<button class=\"global-btn\" onclick=\"openAssetLibrary('+i+','+fi+',\\'gif\\')">Browse</button>'
            +'</div></div></div>'
            +'<div style=\"display:flex;align-items:center;gap:10px;margin-bottom:12px;padding:8px 12px;background:#0a0a18;border:1px solid #2a2a45;border-radius:8px;\">'
            +'<span style=\"font-size:11px;color:#6666aa;font-weight:600;white-space:nowrap;\">Tile Shape</span>'
            +'<select onchange=\"updateFolderShape('+i+','+fi+',this.value)\" style=\"padding:5px 10px;background:#0d0d1a;color:#e8e8f0;border:1px solid #2a2a45;border-radius:6px;font-size:12px;flex:1;\">'
            +'<option value=\"LANDSCAPE\"'+((!f.tileShape||f.tileShape===\"LANDSCAPE\")?\" selected\":\"\")+'>🖼 Landscape (wide)</option>'
            +'<option value=\"PORTRAIT\"'+(f.tileShape===\"PORTRAIT\"?\" selected\":\"\")+'>🎬 Portrait (poster)</option>'
            +'</select></div>'
            +'<div style=\"background:#0a0a18;border:1px solid #2a2a45;border-radius:8px;padding:10px;margin-bottom:10px;\">'
            +'<div style=\"font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#6666aa;margin-bottom:8px;\">Catalog Rows <span style=\"color:#7B2FFF;margin-left:4px;\">'+(f.rows||[]).length+'</span></div>'
            +((f.rows||[]).length?(f.rows||[]).map(function(rowId,ri){
              return '<div style="background:#0d0d1a;border:1px solid #2a2a45;border-radius:6px;padding:7px 10px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;"><div style="color:#c8c8e0;font-size:12px;">'+getCatalogLabel(rowId)+'</div><button class="global-btn" onclick="removeRowFromFolder('+i+','+fi+','+ri+')" style="padding:3px 10px;font-size:11px;">Remove</button></div>';
            }).join(''):'<div style=\"color:#555;font-size:12px;text-align:center;padding:12px 0;\">No rows yet \u2014 add one below</div>')
            +'<div style=\"display:flex;gap:8px;margin-top:8px;\">'
            +'<select id=\"addRowSelect-'+i+'-'+fi+'\" style=\"flex:1;min-width:0;padding:8px 10px;background:#0d0d1a;color:#e8e8f0;border:1px solid #2a2a45;border-radius:6px;font-size:12px;\">'
            +'<option value=\"\">Select a row to add\u2026</option>'
            +avail.map(function(id){return '<option value="'+id+'">'+getCatalogLabel(id)+'</option>';}).join('')
            +'</select>'
            +'<button class=\"global-btn\" onclick=\"addRowToFolder('+i+','+fi+')\" style=\"white-space:nowrap;\">+ Add Row</button>'
            +'</div></div>'
            +'</div>';"""

content = content[:idx] + new_block + content[idx + len(old_block):]
open(SH, 'w').write(content)
print(f"Done — replaced {len(old_block)} chars with {len(new_block)} chars")

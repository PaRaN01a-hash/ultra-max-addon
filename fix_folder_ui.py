#!/usr/bin/env python3
"""
fix_folder_ui.py — Rebuilds the folder card body in setup.html step 3
Run from ~/ultramax-landing: python3 fix_folder_ui.py
"""
import shutil, os

SH = os.path.expanduser("~/ultramax-landing/setup.html")
content = open(SH).read()
shutil.copy2(SH, SH + '.bak_folderui')

old = """          html+='<div class="folder-body">'
            +'<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px;">'
            +'<div><div style="font-size:10px;color:#aaa;margin-bottom:4px;">Cover</div>'
            +(f.coverImageUrl&&f.coverImageUrl.trim()?'<img src="'+f.coverImageUrl+'" style="width:80px;height:46px;object-fit:cover;border-radius:4px;border:1px solid #3a3a55;">':'<div style="width:80px;height:46px;border-radius:4px;border:1px solid #3a3a55;display:flex;align-items:center;justify-content:center;font-size:9px;color:#555;">No cover</div>')
            +'</div><div><div style="font-size:10px;color:#aaa;margin-bottom:4px;">GIF</div>'
            +(f.focusGifEnabled&&f.focusGifUrl&&f.focusGifUrl.trim()?'<img src="'+f.focusGifUrl+'" style="width:80px;height:46px;object-fit:cover;border-radius:4px;border:1px solid #3a3a55;">':'<div style="width:80px;height:46px;border-radius:4px;border:1px solid #3a3a55;display:flex;align-items:center;justify-content:center;font-size:9px;color:#555;">No GIF</div>')
            +'</div>'
            +'<div style="flex:1;min-width:200px;">'
            +'<div style="font-size:10px;color:#aaa;margin-bottom:4px;">Cover URL</div>'
            +'<div style="display:flex;gap:6px;margin-bottom:6px;"><input type="text" value="'+(f.coverImageUrl||'')+'" placeholder="Cover URL" oninput="updateFolderCover('+i+','+fi+',this.value)" style="flex:1;padding:7px 10px;background:#0d0d0d;color:#fff;border:1px solid #3a3a55;border-radius:6px;font-size:11px;"><button class="global-btn" onclick="openAssetLibrary('+i+','+fi+',\\'cover\\')">Browse</button></div>'
            +'<div style="font-size:10px;color:#aaa;margin-bottom:4px;">GIF URL</div>'
            +'<div style="display:flex;gap:6px;align-items:center;"><input type="text" value="'+(f.focusGifUrl||'')+'" placeholder="GIF URL" oninput="updateFolderGif('+i+','+fi+',this.value)" style="flex:1;padding:7px 10px;background:#0d0d0d;color:#fff;border:1px solid #3a3a55;border-radius:6px;font-size:11px;"><button class="global-btn" onclick="openAssetLibrary('+i+','+fi+',\\'gif\\')">Browse</button>'
            +'<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:#aaa;white-space:nowrap;"><input type="checkbox" '+(f.focusGifEnabled?'checked':'')+' onchange="toggleFolderGif('+i+','+fi+',this.checked)"> GIF On</label></div>'
            +'<div style="margin-top:8px;display:flex;align-items:center;gap:8px;"><span style="font-size:10px;color:#aaa;">Tile Shape</span>'
            +'<select onchange="updateFolderShape('+i+','+fi+',this.value)" style="padding:4px 8px;background:#0d0d0d;color:#fff;border:1px solid #3a3a55;border-radius:6px;font-size:11px;">'
            +'<option value="LANDSCAPE"'+((!f.tileShape||f.tileShape==="LANDSCAPE")?" selected":"")+'>🖼 Landscape</option>'
            +'<option value="PORTRAIT"'+(f.tileShape==="PORTRAIT"?" selected":"")+'>🎬 Portrait</option>'
            +'</select></div>'
            +'</div></div>'
            +'<div style="margin-bottom:8px;">'
            +((f.rows||[]).length?(f.rows||[]).map(function(rowId,ri){
              return '<div class="row-item"><div style="color:#9a9a9a;font-size:12px;">'+getCatalogLabel(rowId)+'</div>'
              +'<button class="global-btn" onclick="removeRowFromFolder('+i+','+fi+','+ri+')">Remove</button></div>';
            }).join(''):'<div style="color:#999;font-size:12px;">No rows yet</div>')
            +'</div>'
            +'<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">'
            +'<select id="addRowSelect-'+i+'-'+fi+'" style="flex:1;min-width:180px;padding:8px 10px;background:#0d0d0d;color:#fff;border:1px solid #3a3a55;border-radius:6px;font-size:12px;">'
            +'<option value="">Select a row to add...</option>'
            +avail.map(function(id){return '<option value="'+id+'">'+getCatalogLabel(id)+'</option>';}).join('')
            +'</select>'
            +'<button class="global-btn" onclick="addRowToFolder('+i+','+fi+')">+ Add Row</button>'
            +'</div></div>';"""

new = """          html+='<div class="folder-body">'

            // ── Visuals row ────────────────────────────────────────────
            +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">'

            // Cover
            +'<div style="background:#0a0a18;border:1px solid #2a2a45;border-radius:8px;padding:10px;">'
            +'<div style="font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#6666aa;margin-bottom:8px;">Cover Image</div>'
            +(f.coverImageUrl&&f.coverImageUrl.trim()
              ?'<img src="'+f.coverImageUrl+'" style="width:100%;height:80px;object-fit:cover;border-radius:6px;border:1px solid #2a2a45;margin-bottom:8px;" onerror="this.style.display=\'none\'">'
              :'<div style="width:100%;height:80px;border-radius:6px;border:1px dashed #2a2a45;display:flex;align-items:center;justify-content:center;font-size:10px;color:#444;margin-bottom:8px;">No cover</div>')
            +'<div style="display:flex;gap:6px;">'
            +'<input type="text" value="'+(f.coverImageUrl||'')+'" placeholder="Paste URL…" oninput="updateFolderCover('+i+','+fi+',this.value)" style="flex:1;min-width:0;padding:6px 8px;background:#0d0d1a;color:#e8e8f0;border:1px solid #2a2a45;border-radius:6px;font-size:11px;">'
            +'<button class="global-btn" onclick="openAssetLibrary('+i+','+fi+',\\'cover\\')">Browse</button>'
            +'</div></div>'

            // GIF
            +'<div style="background:#0a0a18;border:1px solid #2a2a45;border-radius:8px;padding:10px;">'
            +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">'
            +'<div style="font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#6666aa;">Focus GIF</div>'
            +'<label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" '+(f.focusGifEnabled?'checked':'')+' onchange="toggleFolderGif('+i+','+fi+',this.checked)" style="accent-color:#7B2FFF;"><span style="font-size:11px;color:#9898bb;">Enabled</span></label>'
            +'</div>'
            +(f.focusGifEnabled&&f.focusGifUrl&&f.focusGifUrl.trim()
              ?'<img src="'+f.focusGifUrl+'" style="width:100%;height:80px;object-fit:cover;border-radius:6px;border:1px solid #2a2a45;margin-bottom:8px;" onerror="this.style.display=\'none\'">'
              :'<div style="width:100%;height:80px;border-radius:6px;border:1px dashed #2a2a45;display:flex;align-items:center;justify-content:center;font-size:10px;color:#444;margin-bottom:8px;">No GIF</div>')
            +'<div style="display:flex;gap:6px;">'
            +'<input type="text" value="'+(f.focusGifUrl||'')+'" placeholder="Paste GIF URL…" oninput="updateFolderGif('+i+','+fi+',this.value)" style="flex:1;min-width:0;padding:6px 8px;background:#0d0d1a;color:#e8e8f0;border:1px solid #2a2a45;border-radius:6px;font-size:11px;">'
            +'<button class="global-btn" onclick="openAssetLibrary('+i+','+fi+',\\'gif\\')">Browse</button>'
            +'</div></div>'
            +'</div>'

            // ── Settings row ───────────────────────────────────────────
            +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding:8px 12px;background:#0a0a18;border:1px solid #2a2a45;border-radius:8px;">'
            +'<span style="font-size:11px;color:#6666aa;font-weight:600;white-space:nowrap;">Tile Shape</span>'
            +'<select onchange="updateFolderShape('+i+','+fi+',this.value)" style="padding:5px 10px;background:#0d0d1a;color:#e8e8f0;border:1px solid #2a2a45;border-radius:6px;font-size:12px;flex:1;">'
            +'<option value="LANDSCAPE"'+((!f.tileShape||f.tileShape==="LANDSCAPE")?" selected":"")+'>🖼 Landscape (wide)</option>'
            +'<option value="PORTRAIT"'+(f.tileShape==="PORTRAIT"?" selected":"")+'>🎬 Portrait (poster)</option>'
            +'</select>'
            +'</div>'

            // ── Rows ───────────────────────────────────────────────────
            +'<div style="background:#0a0a18;border:1px solid #2a2a45;border-radius:8px;padding:10px;margin-bottom:10px;">'
            +'<div style="font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#6666aa;margin-bottom:8px;">Catalog Rows <span style="color:#7B2FFF;margin-left:4px;">'+(f.rows||[]).length+'</span></div>'
            +((f.rows||[]).length
              ?(f.rows||[]).map(function(rowId,ri){
                return '<div class="row-item" style="background:#0d0d1a;border:1px solid #2a2a45;border-radius:6px;padding:7px 10px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;">'
                +'<div style="color:#c8c8e0;font-size:12px;">'+getCatalogLabel(rowId)+'</div>'
                +'<button class="global-btn" onclick="removeRowFromFolder('+i+','+fi+','+ri+')" style="padding:3px 10px;font-size:11px;">✕ Remove</button></div>';
              }).join('')
              :'<div style="color:#555;font-size:12px;text-align:center;padding:12px 0;">No rows yet — add one below</div>')
            +'<div style="display:flex;gap:8px;margin-top:8px;">'
            +'<select id="addRowSelect-'+i+'-'+fi+'" style="flex:1;min-width:0;padding:8px 10px;background:#0d0d1a;color:#e8e8f0;border:1px solid #2a2a45;border-radius:6px;font-size:12px;">'
            +'<option value="">Select a row to add…</option>'
            +avail.map(function(id){return '<option value="'+id+'">'+getCatalogLabel(id)+'</option>';}).join('')
            +'</select>'
            +'<button class="global-btn" onclick="addRowToFolder('+i+','+fi+')" style="white-space:nowrap;">+ Add Row</button>'
            +'</div></div>'

            +'</div>';"""

if old not in content:
    print("ERROR: old block not found")
    exit(1)

content = content.replace(old, new, 1)
open(SH, 'w').write(content)
print("Done")

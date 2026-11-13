"""Snapshot the standalone Atoll runtime without its workspace or diagnostics.

Run from site/: python scripts/vendor-glass-atoll.py [source-directory]
The original project is read only. Publication adapters are recorded below and
every input/output is hashed in glass-atoll-provenance.json.
"""
from pathlib import Path
import gzip
import hashlib
import json
import sys

SITE = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else SITE.parent / 'glass-atoll'
DEST = SITE / 'public/play/glass-atoll'
files = set(['index.html', 'style.css', 'viewer-ui.css', 'assets/credits.html', 'assets/audio/credits.html'])
files.update(p.name for p in SOURCE.glob('*.js'))
files.update(str(p.relative_to(SOURCE)).replace('\\', '/') for p in (SOURCE / 'vendor').rglob('*') if p.is_file() and 'aces2-generated' not in p.parts)
files.update([
    'assets/clean-sand/sand_02_diff_2k.jpg', 'assets/clean-sand/SOURCES.md',
    'assets/night/astronomy.js', 'assets/night/ASTRONOMY-LICENSE.txt',
    'assets/night/astronomy-version.json', 'assets/night/lroc_color_poles_1k.jpg',
    'assets/night/SOURCES.md', 'assets/night/catalog/manifest.json',
    'assets/night/catalog/LICENSE-SOURCES.txt', 'assets/night/catalog/milkyway-4k.hdr',
    'assets/audio/ocean-shore.ogg', 'assets/audio/leaf-rustle.ogg',
    'assets/audio/SOURCES.md',
    'assets/audio/fireworks/SOURCES.md', 'assets/audio/fireworks/palette-source.json',
])
files.update(str(p.relative_to(SOURCE)).replace('\\', '/') for p in (SOURCE / 'assets/night/catalog').glob('*.bin'))
files.update(str(p.relative_to(SOURCE)).replace('\\', '/') for p in (SOURCE / 'assets/views').glob('*.webp'))
files.update(str(p.relative_to(SOURCE)).replace('\\', '/') for p in (SOURCE / 'assets/audio/fireworks').glob('*.ogg'))

def pack_bin(name, data):
    """gzip(header + byte planes). Header: value width, alpha-one flag, original length (LE u32).
    Values are split into byte planes (all low bytes, then all high bytes ...). The RGBA16F diffuse
    atlas keeps only its RGB halves when every alpha half is exactly 1.0 (0x3C00)."""
    width = 2 if 'rgba16f' in name else 4
    alpha_one = width == 2 and len(data) % 8 == 0 and data[6::8] == bytes(len(data) // 8) and data[7::8] == b'\x3c' * (len(data) // 8)
    if alpha_one:
        records = len(data) // 8
        halves = bytearray(records * 6)
        for channel in range(3):
            halves[channel * 2::6] = data[channel * 2::8]
            halves[channel * 2 + 1::6] = data[channel * 2 + 1::8]
        values = bytes(halves)
    else:
        values = data
    planes = b''.join(values[plane::width] for plane in range(width))
    header = bytes([width, 1 if alpha_one else 0]) + len(data).to_bytes(4, 'little')
    return gzip.compress(header + planes, compresslevel=9, mtime=0)


def unpack_bin(packed):
    raw = gzip.decompress(packed)
    width, alpha_one, original = raw[0], raw[1] == 1, int.from_bytes(raw[2:6], 'little')
    body = raw[6:]
    count = len(body) // width
    values = bytearray(len(body))
    for plane in range(width):
        values[plane::width] = body[plane * count:(plane + 1) * count]
    if not alpha_one:
        return bytes(values)
    out = bytearray(original)
    for channel in range(3):
        out[channel * 2::8] = values[channel * 2::6]
        out[channel * 2 + 1::8] = values[channel * 2 + 1::6]
    out[7::8] = b'\x3c' * (original // 8)
    return bytes(out)


def replace_once(text, before, after):
    if text.count(before) != 1:
        raise ValueError(f'Upstream changed; review adapter: {before[:90]}')
    return text.replace(before, after, 1)

def adapt(name, data):
    if name not in ('index.html', 'style.css', 'main.js', 'quality-presets.js', 'hdr-output.js', 'aces2-output.js', 'star-field.js', 'assets/credits.html', 'assets/audio/credits.html'):
        return data
    text = data.decode('utf-8')
    if name == 'index.html':
        text = replace_once(text, '<script type="importmap">', '<script>window.ATOLL_STATIC_HOST=true;</script>\n    <script type="importmap">')
        text = replace_once(text, '<div class="identity">', '<div class="identity"><a class="portfolio-return" href="../../projects/glass-atoll/" aria-label="返回玻璃海作品介绍">←</a>')
        text = replace_once(text, '<script type="module" src="./main.js"></script>', '<noscript><p class="static-notice">请启用 JavaScript 来探索这座岛。<a href="../../projects/glass-atoll/#gallery">查看实机画面</a></p></noscript>\n    <script type="module" src="./main.js"></script>')
    elif name == 'style.css':
        text += '\n/* Portfolio-host navigation, without a loading dependency. */\n.portfolio-return{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;color:inherit;text-decoration:none;font-size:24px;border-radius:50%;background:rgba(255,255,255,.2)}\n.portfolio-return:hover{background:rgba(255,255,255,.45)}\n.portfolio-return:focus-visible{outline:2px solid currentColor;outline-offset:3px}\n.static-notice{position:fixed;z-index:100;inset:40% 20% auto;background:#f4faf7;padding:24px;color:#234747}\n'
    elif name == 'quality-presets.js':
        text = replace_once(text, "export const DEFAULT_QUALITY = 'medium';", "export const DEFAULT_QUALITY = 'low'; // Hosted default; all quality options remain available.")
    elif name == 'main.js':
        text = replace_once(text, '请用“启动网页.cmd”打开，并使用支持 WebGL 2 的浏览器。', '请刷新页面，或使用支持 WebGL 2 的浏览器。')
        # Allocate the selected preset immediately instead of creating an unused
        # high-resolution caustics pass and replacing it during applyQuality.
        text = replace_once(text, 'gridSegments:1536,textureSize:2048,heightmapSize:1024,maxHz:24', 'gridSegments:parameters.renderSampling.causticsGrid,textureSize:parameters.renderSampling.causticsSize,heightmapSize:1024,maxHz:parameters.renderSampling.causticsHz')
        # The ~46 MB night set is fetched on demand online: sky.js starts it once the sun is below
        # 12 degrees (well before stars are visible) and the star/moon views request it directly.
        text = replace_once(text, "  if(typeof requestIdleCallback==='function')requestIdleCallback(preloadNight,{timeout:5000});else setTimeout(preloadNight,2000);",
                            "  if(!globalThis.ATOLL_STATIC_HOST){if(typeof requestIdleCallback==='function')requestIdleCallback(preloadNight,{timeout:5000});else setTimeout(preloadNight,2000);}")
    elif name == 'hdr-output.js':
        text = replace_once(text, 'export async function fetchDisplayHDR({timeoutMs=15000,signal}={}){', "export async function fetchDisplayHDR({timeoutMs=15000,signal}={}){\n  if(globalThis.ATOLL_STATIC_HOST)return {available:false,source:'static-host',displays:[],errors:[],note:'在线版使用浏览器显示能力；原生显示器测量仅在本地服务中提供。'};")
    elif name == 'aces2-output.js':
        text = replace_once(text, 'const peak=peakValue(peakNits);if(pending', "const peak=peakValue(peakNits);if(globalThis.ATOLL_STATIC_HOST&&!ACES2_OUTPUT_TARGETS.includes(peak))return Promise.resolve({ready:false,supported:false,reason:'static-host-pinned-targets-only',peakNits:peak});if(pending")
    elif name == 'star-field.js':
        before = "const fetchBin=async name=>{const r=await fetch(new URL(name,base));if(!r.ok)throw new Error(name+' HTTP '+r.status);return r.arrayBuffer();};"
        after = """const fetchBin=async name=>{
      // Lossless transfer packs (.pk2): gzip of byte planes, plus dropping the RGBA16F diffuse
      // alpha that is always 1.0. Decoding restores the identical catalogue bytes.
      if(typeof DecompressionStream==='function'){
        try{
          const r=await fetch(new URL(name+'.pk2',base));
          if(r.ok){
            const packed=new Uint8Array(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
            const view=new DataView(packed.buffer),width=view.getUint8(0),alphaOne=view.getUint8(1)===1,original=view.getUint32(2,true);
            const body=packed.subarray(6),count=body.length/width;
            if(!Number.isInteger(count)||(alphaOne?count*width/6*8:count*width)!==original)throw new Error('pack size');
            const values=new Uint8Array(body.length);
            for(let plane=0;plane<width;plane++){const src=body.subarray(plane*count,(plane+1)*count);for(let i=0,o=plane;i<count;i++,o+=width)values[o]=src[i];}
            if(!alphaOne)return values.buffer;
            const out=new Uint8Array(original);
            for(let r=0,v=0,o=0;o<original;r++,v+=6,o+=8){out[o]=values[v];out[o+1]=values[v+1];out[o+2]=values[v+2];out[o+3]=values[v+3];out[o+4]=values[v+4];out[o+5]=values[v+5];out[o+7]=0x3c;}
            return out.buffer;
          }
        }catch{
          // A failed transfer, unsupported codec or corrupt optional pack must
          // not prevent the intact original catalogue from loading.
        }
      }
      const r=await fetch(new URL(name,base));if(!r.ok)throw new Error(name+' HTTP '+r.status);return r.arrayBuffer();
    };"""
        text = replace_once(text, before, after)
    else:
        text = replace_once(text, '<html lang="zh-CN">', '<html lang="zh-CN"><head>')
        text = replace_once(text, '<h1>', '</head><body><h1>')
        text = replace_once(text, '</html>', '</body></html>')
    return text.encode('utf-8')

records = []
for name in sorted(files):
    original = (SOURCE / name).read_bytes()
    published = adapt(name, original)
    target = DEST / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(published)
    records.append({'path': name, 'sourceSHA256': hashlib.sha256(original).hexdigest(), 'sha256': hashlib.sha256(published).hexdigest(), 'bytes': len(published), 'adapted': published != original})
    if name.endswith('.bin'):
        compressed = pack_bin(name, original)
        Path(str(target) + '.pk2').write_bytes(compressed)
        assert unpack_bin(compressed) == original
        records.append({'path': name + '.pk2', 'sha256': hashlib.sha256(compressed).hexdigest(), 'bytes': len(compressed), 'losslessSource': name})
        stale = Path(str(target) + '.pack')
        if stale.exists():
            stale.unlink()

manifest = {'schema': 'liss.atoll-static.v1', 'source': '../glass-atoll (local runtime snapshot)', 'originalsModified': False,
    'adapters': ['Static host flag and works return link; no-JavaScript fallback.', 'Native-only display report is explicitly unavailable; pinned ACES targets remain available.', 'Optional server-generated ACES targets decline with a controlled reason.', 'Catalogue byte-plane gzip packs (.pk2, constant diffuse alpha omitted) with byte-identical decoding; HTTP, network and decoding failures fall back to the original catalogue.', 'Night sky assets load on demand (sun below 12 degrees, or star/moon views) instead of an unconditional idle preload.', 'Hosted default uses the existing low preset, with all quality options available; initial caustics allocate that preset directly.', 'Failure guidance refers to the browser rather than a local launcher.', 'Credits receive explicit HTML head/body for host metadata.'],
    'excluded': ['server.mjs', 'verification/', 'tools/', 'original recordings', 'reference downloads', 'native probes', 'workspace history'],
    'files': records}
(SITE / 'glass-atoll-provenance.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Atoll: {len(records)} runtime files, {sum(r["bytes"] for r in records):,} bytes; originals unchanged.')

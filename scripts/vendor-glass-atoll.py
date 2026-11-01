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
    elif name == 'hdr-output.js':
        text = replace_once(text, 'export async function fetchDisplayHDR({timeoutMs=15000,signal}={}){', "export async function fetchDisplayHDR({timeoutMs=15000,signal}={}){\n  if(globalThis.ATOLL_STATIC_HOST)return {available:false,source:'static-host',displays:[],errors:[],note:'在线版使用浏览器显示能力；原生显示器测量仅在本地服务中提供。'};")
    elif name == 'aces2-output.js':
        text = replace_once(text, 'const peak=peakValue(peakNits);if(pending', "const peak=peakValue(peakNits);if(globalThis.ATOLL_STATIC_HOST&&!ACES2_OUTPUT_TARGETS.includes(peak))return Promise.resolve({ready:false,supported:false,reason:'static-host-pinned-targets-only',peakNits:peak});if(pending")
    elif name == 'star-field.js':
        before = "const fetchBin=async name=>{const r=await fetch(new URL(name,base));if(!r.ok)throw new Error(name+' HTTP '+r.status);return r.arrayBuffer();};"
        after = """const fetchBin=async name=>{
      // Lossless transfer compression; identical catalogue bytes on the GPU.
      if(typeof DecompressionStream==='function'){
        const r=await fetch(new URL(name+'.pack',base));
        if(r.ok)return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
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
        compressed = gzip.compress(original, compresslevel=9, mtime=0)
        Path(str(target) + '.pack').write_bytes(compressed)
        assert gzip.decompress(compressed) == original
        records.append({'path': name + '.pack', 'sha256': hashlib.sha256(compressed).hexdigest(), 'bytes': len(compressed), 'losslessSource': name})

manifest = {'schema': 'liss.atoll-static.v1', 'source': '../glass-atoll (local runtime snapshot)', 'originalsModified': False,
    'adapters': ['Static host flag and works return link; no-JavaScript fallback.', 'Native-only display report is explicitly unavailable; pinned ACES targets remain available.', 'Optional server-generated ACES targets decline with a controlled reason.', 'Catalogue gzip transfer with byte-identical decompression and uncompressed fallback.', 'Hosted default uses the existing low preset, with all quality options available; initial caustics allocate that preset directly.', 'Failure guidance refers to the browser rather than a local launcher.', 'Credits receive explicit HTML head/body for host metadata.'],
    'excluded': ['server.mjs', 'verification/', 'tools/', 'original recordings', 'reference downloads', 'native probes', 'workspace history'],
    'files': records}
(SITE / 'glass-atoll-provenance.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Atoll: {len(records)} runtime files, {sum(r["bytes"] for r in records):,} bytes; originals unchanged.')

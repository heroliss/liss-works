# Local astronomical assets

## Stellar atlas and Milky Way

- Original: [NASA SVS4851, Deep Star Maps2020](https://svs.gsfc.nasa.gov/4851/), NASA/Goddard Space Flight Center Scientific Visualization Studio, Ernie Wright (USRA).
- Original download: [starmap_2020_4k.exr](https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/starmap_2020_4k.exr),4096×2048, linear half-float,35,997,085bytes. SHA256 `69b841cd048c2ef35543eb1c5819b322530e78aa4b0cab97ec1de3ef56a4ddcd`.
- Local runtime: `starmap_2020_4k.hdr`,31,698,393bytes. It is a linear RadianceRGBE transcode of the original, with no rearranged stars or painted galaxy. Measured relativeL1 quantization error .26224%. SHA256 `76b33967500e3560d35f64b664825d8d0e1fe395eead0d6bd65e3004b075c2dd`.
- NASA atlas is ICRF/J2000 right ascension/declination in plate carrée,RA0 at image center,RA increasing left. It plots catalog positions/brightness/colors, including the Milky Way, from Hipparcos-2,Tycho-2,GaiaDR2 and supporting catalogs. Credits: NASA/GoddardSVS; ESA/Gaia/DPAC and the catalog providers identified in the saved metadata.
- `nasa-svs-4851-metadata.json` retains the original pageAPI metadata; `nasa-starmap-preview.jpg` is the author's1024px preview. Only the astronomical sphere uses this atlas; no terrain/sea/landscape photograph replaces the3D scene.
- The atlas is a scientific visualization, not absolute calibrated spectral radiance. Runtime intensity is explicitly authored; it does not assert naked-eye visibility of all catalog objects or exact stellar PSFs.

## Lunar albedo

- [NASA SVS4720, CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/), Ernie Wright/Noah Petro, based on LRO/LROC.
- [lroc_color_poles_1k.jpg](https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_1k.jpg),1024×512,139,068bytes; unchanged original. SHA256 `b246064f217f8d479df78c49c7c8595a8f5fbda008a72fd539978d2e121e0109`.
- Page metadata is saved as `nasa-svs-4720-metadata.json`. Runtime lunar geometry/phase is computed separately; this albedo map supplies surface appearance, not a pre-rendered moon photograph.

## NASA use terms

[NASA SVS help/usage](https://svs.gsfc.nasa.gov/help/) states its content is public domain unless specifically noted. Neither selected visual product states a separate restriction in the saved metadata. NASA attribution is retained; no NASA endorsement is implied. This statement concerns the selected NASA visual products, not a blanket relicensing of every upstream star catalog or unrelated site asset.

## Ephemeris software

- [Astronomy Engine](https://github.com/cosinekitty/astronomy), Don Cross and contributors, MIT.
- Vendored ES module `astronomy.js` from commit `826e26ff3a6dc03ee46658b1138fef582d96c5d9`, `source/js/esm/astronomy.js`; SHA256 `0276ebbcfc3746cad98417e3082ba510067ae81a92c1f6ad0f43fae8d417fdc7`.
- Original MIT copyright/permission notice is retained in `ASTRONOMY-LICENSE.txt`; source provenance in `astronomy-version.json`.
- Used for J2000/local coordinate transforms, sidereal time, Moon topocentric direction, phase, radius and approximate libration. Manual scene solar direction is independent of this timestamp's astronomical Sun.

Default site:4.5°N,118.6°E,2026-10-26 local22:00 (UTC14:00):near-full Moon99.60%,altitude55.86°. The dark-sky preset2026-08-13 local22:00 has Moon0.98% and altitude−44.57°, with the Galactic center about49.22°high. These are model ephemerides, not a claim of observed local transparency, weather or light pollution.

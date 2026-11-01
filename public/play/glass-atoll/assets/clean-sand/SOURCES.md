# Clean sand candidate source audit

## Inspected alternate candidate: ambientCG Ground092A

- Original author/source: [Ground 092 A, ambientCG](https://ambientcg.com/view?id=Ground092A).
- Official download: <https://ambientcg.com/get?file=Ground092A_2K-JPG.zip>.
- License: [CC0 1.0 Universal](https://docs.ambientcg.com/license/), covering raw downloadable assets and previews. Downloaded 2026-10-26.
- Important provenance: the asset page says **Procedural**. This is an authored PBR material, not a photographic sand scan. The v2 API's generic creation-method display string is inconsistent with its `PBRProcedural` enum; use the asset page and enum, not that generic string.
- Official API `dimensionX`, `dimensionY`, `dimensionZ` are all 0: **physical tile dimensions were not supplied**. A 2 m tile, if used by the scene, is an artistic scale calibration rather than a measured source dimension.
- Original zip and maps retained in `Ground092A_2K-JPG/`. Use `Ground092A_2K-JPG_Color.jpg`, `Ground092A_2K-JPG_NormalGL.jpg`, `Ground092A_2K-JPG_Roughness.jpg`. All are 2048 x 2048.
- Actual full-map inspection: Color, NormalDX preview and downloaded NormalGL were viewed. No recognizable footwear tread or shoe outline was found. The relief consists of curved, approximately aligned sand crests with fine grains. This inspection does not establish photographic origin.
- Color statistics, decoded sRGB to linear using the standard transfer function: mean `[0.768617626, 0.627187906, 0.444262161]`; per-channel standard deviation `[0.032495845, 0.026839698, 0.020872499]`. Encoded mean RGB255 `[227.008274, 207.426117, 177.779576]`. Roughness-map scalar mean `0.582752725` (linear data).

## Other inspected candidates, not recommended

- Poly Haven `sand_02`: the actual normal preview contains recognizable footwear/tread. Physical tile width 2.14 m. Do not describe the entire PBR set as clean. The separately inspected quiet diffuse may be used alone by the scene; this does not imply use or acceptance of the source normal, roughness or displacement maps.
- ambientCG `Ground101`: Color is fine and quiet, but NormalDX shows sparse shallow oval depressions. Their origin is uncertain, so Ground092A was preferred.
- The `preview-*` files are the original official surface-map previews, retained for audit. Previews do not imply use by the scene.

The retained `sand_02_diff_2k.jpg` is the final active diffuse-only input. Its actual 2K image was inspected independently and no recognizable shoe tread was found. The final shader reads no Sand 02 normal/roughness/displacement, no Sand 03 maps, and no old Aerial Beach maps. Source Sand 02 still must not be described as an entirely clean PBR set. Ground092A remains an unused alternative.

// Analytic contract for the existing static rounded-cay terrain in main.js.
// This wraps the actual height callback; it never duplicates the terrain mesh,
// extinguishes a firework, changes its trajectory, or removes smoke/material.
export const ATOLL_AIR_SURFACE_LIMITS=Object.freeze({
  schema:'glass-atoll.atoll-air-surface.v1',meanSeaHeight:0,clearanceMetres:.03,
  minimumHeight:0,maximumHeight:1.327,maximumSpatialSlope:.26,maximumTimeRate:0,
  heightErrorMetres:0,
  coreCentreX:-1.5,coreCentreZ:-1,coreRadiusX:30,coreRadiusZ:19,
  corePaddedNormalizedRadius:1.01/.91,
  spitCentreX:26,spitCentreZ:7,spitSquaredRadiusX:330,spitSquaredRadiusZ:72,
  spitPaddedQuadraticThreshold:.678,regionComparisonPadding:2e-12,
});
const finite=(x,name)=>{if(typeof x!=='number'||!Number.isFinite(x))throw new RangeError(name+' must be finite');return x;};
const distanceToInterval=(centre,minimum,maximum)=>centre<minimum?minimum-centre:centre>maximum?centre-maximum:0;

export function createAtollAirSurface(terrainHeight){
  if(typeof terrainHeight!=='function'||terrainHeight.constructor?.name==='AsyncFunction')throw new TypeError('Atoll surface requires the synchronous existing terrainHeight(x,z)');
  const L=ATOLL_AIR_SURFACE_LIMITS;
  function heightAt(x,z,time){
    finite(x,'Surface x');finite(z,'Surface z');if(time!==undefined)finite(time,'Surface time');
    const ground=finite(terrainHeight(x,z),'Terrain height'),height=Math.max(L.meanSeaHeight,ground);
    if(height>L.maximumHeight)throw new RangeError('Terrain exceeds the existing atoll analytic height contract');
    return height;
  }
  function boundAtHorizontalRegion({minimumX,maximumX,minimumZ,maximumZ}={}){
    finite(minimumX,'Region minimumX');finite(maximumX,'Region maximumX');finite(minimumZ,'Region minimumZ');finite(maximumZ,'Region maximumZ');
    if(minimumX>maximumX||minimumZ>maximumZ)throw new RangeError('Horizontal region bounds are inverted');
    // Minimum quadratic ellipse coordinate anywhere in this closed rectangle.
    // Both padded ellipses must be excluded. Test an entire trajectory X/Z
    // enclosure here; checking only its endpoints cannot certify the interior.
    const coreX=distanceToInterval(L.coreCentreX,minimumX,maximumX)/L.coreRadiusX,coreZ=distanceToInterval(L.coreCentreZ,minimumZ,maximumZ)/L.coreRadiusZ;
    const spitX=distanceToInterval(L.spitCentreX,minimumX,maximumX),spitZ=distanceToInterval(L.spitCentreZ,minimumZ,maximumZ);
    const minimumCoreQuadratic=coreX*coreX+coreZ*coreZ,minimumSpitQuadratic=spitX*spitX/L.spitSquaredRadiusX+spitZ*spitZ/L.spitSquaredRadiusZ;
    const seaOnly=minimumCoreQuadratic>=L.corePaddedNormalizedRadius*L.corePaddedNormalizedRadius+L.regionComparisonPadding&&minimumSpitQuadratic>=L.spitPaddedQuadraticThreshold+L.regionComparisonPadding;
    return Object.freeze({minimumHeight:0,maximumHeight:seaOnly?0:L.maximumHeight,maximumSpatialSlope:seaOnly?0:L.maximumSpatialSlope,maximumTimeRate:0,heightErrorMetres:0,
      certifiedSeaOnly:seaOnly,...(seaOnly?{planeHeight:0}:{}),minimumCoreQuadratic,minimumSpitQuadratic,
      model:seaOnly?'mean-sea plane outside both padded atoll support ellipses':'global static clipped-atoll surface enclosure'});
  }
  return Object.freeze({schema:L.schema,heightAt,boundAtHorizontalRegion,minimumHeight:L.minimumHeight,maximumHeight:L.maximumHeight,maximumSpatialSlope:L.maximumSpatialSlope,maximumTimeRate:L.maximumTimeRate,heightErrorMetres:L.heightErrorMetres,
    meanSeaHeight:L.meanSeaHeight,clearanceMetres:L.clearanceMetres,
    contract:'Caller supplies the unchanged main.js rounded-cay terrainHeight. Arbitrary terrain callbacks require their own explicit certified bounds; this factory cannot infer them from samples.',
    scope:'max(static existing terrain, mean sea0), not animated wave collision, opacity, extinction, chemistry or material deposition'});
}

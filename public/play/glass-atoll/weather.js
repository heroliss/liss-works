/* A bounded, prescribed marine-cumulus weather controller.
 * Thermodynamics: Magnus dew point and an approximate parcel LCL.
 * Motion: advected/turbulent density is in sky.js, not a Navier–Stokes or
 * forecast model. Surface RH alone cannot determine cloud coverage/CAPE.
 * https://www.noaa.gov/jetstream/clouds/how-clouds-form
 * https://www.weather.gov/media/zhu/ZHU_Training_Page/Met_Tutorials/Weather_Theory.pdf
 */

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
export function dewPointCelsius(temperature=29,humidity=.68){
  const t=clamp(finite(temperature,29),-20,45),rh=clamp(finite(humidity,.68),.05,1);
  const gamma=Math.log(rh)+17.625*t/(243.04+t);
  return 243.04*gamma/(17.625-gamma);
}
export function deriveWeather(input={}){
  const temperature=clamp(finite(input.temperature,29),-10,40),humidity=clamp(finite(input.humidity,.68),.2,.98);
  const dewPoint=dewPointCelsius(temperature,humidity);
  // The dry parcel cools at ~9.8 K/km; its dewpoint decreases ~1.8 K/km.
  // Their ~8 K/km convergence gives 125 m/K. This is an LCL estimate, not
  // the result of a measured sounding or a convective stability calculation.
  const liftedCondensationLevel=Math.max(0,125*(temperature-dewPoint));
  const automaticCloudBase=input.cloudBase===undefined||input.cloudBase===null||input.cloudBase==='auto';
  const cloudBase=clamp(automaticCloudBase?liftedCondensationLevel:finite(input.cloudBase,1100),100,4500);
  const thickness=clamp(finite(input.thickness,input.cloudThickness??950),250,2200);
  return {
    temperature,humidity,dewPoint,liftedCondensationLevel,automaticCloudBase,cloudBase,
    thickness,cloudTop:cloudBase+thickness,coverage:clamp(finite(input.coverage,.35),0,1),
    // Density only represents the entrained fraction of a real cloudy
    // parcel. RH influences liquid-water abundance gently; it never creates
    // cloud by itself when the separately specified ascent coverage is zero.
    moisture:.76+.44*clamp((humidity-.4)/.55,0,1),
    shear:clamp(finite(input.shear,1.1),-6,6),
    windDirection:Number.isFinite(input.windDirection)?((input.windDirection%360)+360)%360:null,
    model:'prescribed moist parcel LCL plus kinematic cumulus; no atmospheric fluid/forecast solve',
  };
}

export function createWeatherController(initial={}){
  let target=deriveWeather(initial),current={...target};
  function setWeather(patch={},options={}){
    // Explicit aliases keep the public UI contract small and metre-based.
    const merged={...target,...patch};
    if('altitude' in patch&&!('cloudBase' in patch))merged.cloudBase=patch.altitude;
    if('cloudThickness' in patch&&!('thickness' in patch))merged.thickness=patch.cloudThickness;
    if(!('cloudBase' in patch)&&!('altitude' in patch))merged.cloudBase=target.automaticCloudBase?'auto':target.cloudBase;
    if(patch.windDirection===null)merged.windDirection=null;
    target=deriveWeather(merged);
    if(options.immediate)current={...target};
    return state();
  }
  function update(dt=0){
    const blend=1-Math.exp(-clamp(finite(dt,0),0,10)/2.5);
    for(const key of ['temperature','humidity','cloudBase','thickness','coverage','moisture','shear'])current[key]+=(target[key]-current[key])*blend;
    current.dewPoint=dewPointCelsius(current.temperature,current.humidity);
    current.liftedCondensationLevel=125*(current.temperature-current.dewPoint);
    current.cloudTop=current.cloudBase+current.thickness;
    current.automaticCloudBase=target.automaticCloudBase;
    if(target.windDirection===null)current.windDirection=null;
    else if(current.windDirection===null)current.windDirection=target.windDirection;
    else{
      const delta=((target.windDirection-current.windDirection+540)%360)-180;
      current.windDirection=((current.windDirection+delta*blend)%360+360)%360;
    }
    return current;
  }
  function state(){return {current:{...current},target:{...target},transitionSeconds:2.5,units:{temperature:'degrees Celsius',humidity:'fraction 0..1',cloudBase:'metres above sea level',thickness:'metres',shear:'metres/second/kilometre',windDirection:'degrees clockwise from +Z; null follows update wind'},limits:['LCL is a surface-parcel estimate, not a sounding','Cloud coverage is independently prescribed ascent availability','No precipitation, prognostic humidity, CAPE or Navier–Stokes solve']};}
  return {setWeather,update,state};
}

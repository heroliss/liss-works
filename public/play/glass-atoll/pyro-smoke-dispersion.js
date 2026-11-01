// Pure marginal-dispersion math. No RNG, renderer, clock or source mutation.
// Taylor assumes stationary zero-mean, exponentially correlated ensemble
// velocities; using it as puff width additionally assumes decorrelated parcels.
export function parseSmokeDispersion({dispersionModel='brownian',lagrangianSeconds=10}={}){
  if(dispersionModel!=='brownian'&&dispersionModel!=='taylor')throw new RangeError('dispersionModel must be brownian or taylor');
  if(dispersionModel==='taylor'&&(!Number.isFinite(lagrangianSeconds)||lagrangianSeconds<=0))throw new RangeError('Taylor lagrangianSeconds must be finite positive');
  return{dispersionModel,...(dispersionModel==='taylor'?{lagrangianSeconds}:{})};
}
export function validateDispersionMemory(q){if(!Number.isFinite(q)||q<0||q>1)throw new RangeError('Taylor dispersionQ must be finite within0..1');return q;}
export function taylorDispersionFactors(dt,lagrangianSeconds){
  if(!Number.isFinite(dt)||dt<0)throw new RangeError('Dispersion dt must be finite nonnegative');
  if(!Number.isFinite(lagrangianSeconds)||lagrangianSeconds<=0)throw new RangeError('Taylor lagrangianSeconds must be finite positive');
  if(dt===0)return{decay:1,freshTime:0};
  const x=dt/lagrangianSeconds;let freshTime;
  if(x<1e-3){
    // TL*(x+expm1(-x)), factored to avoid cancellation/underflow ofx*x.
    const series=.5+x*(-1/6+x*(1/24+x*(-1/120+x*(1/720+x*(-1/5040+x/40320)))));
    freshTime=dt*x*series;
  }else freshTime=dt+lagrangianSeconds*Math.expm1(-x);
  if(!Number.isFinite(freshTime)||freshTime<0||freshTime>dt)throw new RangeError('Taylor variance increment exceeded its nonnegative domain');
  return{decay:Math.exp(-x),freshTime};
}
export function taylorDispersionAge(age,lagrangianSeconds){const f=taylorDispersionFactors(age,lagrangianSeconds);return{varianceTime:f.freshTime,dispersionQ:f.decay};}
export function taylorDispersionStep(dt,q,lagrangianSeconds){validateDispersionMemory(q);const f=taylorDispersionFactors(dt,lagrangianSeconds);return{varianceTime:dt*(1-q)+q*f.freshTime,dispersionQ:q*f.decay};}

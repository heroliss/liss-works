// A&S7.1.26, primary book p299: |epsilon|<=1.5e-7, x>=0.
// https://personal.math.ubc.ca/~cbm/aands/page_299.htm (primary scan mirror)
// Extra1e-8 is declared implementation slack, not a formal JS libm proof.
export const SMOKE_ERF_ABSOLUTE_ERROR=1.6e-7;
export function smokeErfcApproxPositive(x){
  const t=1/(1+.3275911*x);
  return Math.max(0,Math.min(1,(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-x*x)));
}
export function smokeErfDifferenceApprox(a,b){
  if(a===b)return 0;
  if(a>=0)return Math.max(0,smokeErfcApproxPositive(a)-smokeErfcApproxPositive(b));
  if(b<=0)return Math.max(0,smokeErfcApproxPositive(-b)-smokeErfcApproxPositive(-a));
  return Math.max(0,2-smokeErfcApproxPositive(-a)-smokeErfcApproxPositive(b));
}

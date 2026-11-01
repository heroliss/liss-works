export const SMOKE_MODES=Object.freeze(['light','full','off']);
export function resolveSmokeMode(patch={},previous={smokeQuality:'light',persistentSmoke:false}){
  let mode=patch.smokeQuality;
  if(mode===undefined&&Object.hasOwn(patch,'persistentSmoke'))mode=patch.persistentSmoke?'full':'off';
  if(mode===undefined)mode=previous.smokeQuality??(previous.persistentSmoke?'full':'light');
  if(!SMOKE_MODES.includes(mode))throw new RangeError('Unknown smoke quality');
  return {smokeQuality:mode,persistentSmoke:mode==='full'};
}

// A newly enabled long-lived medium starts now. A burst from a carrier launched
// in an earlier disabled epoch must not enter a source scheduler without its
// launch. Sound consumes the complete event stream independently.
export function createSmokeEpochAdmission(){
  const launched=new Map();
  return {
    accept(events,now){
      if(!Number.isFinite(now)||!Array.isArray(events))throw new TypeError('Finite time and events required');
      for(const [id,until]of launched)if(until<now)launched.delete(id);
      const accepted=[];
      for(const event of events){
        if(event.kind==='launch')launched.set(event.eventId,now+120);
        if(launched.has(event.eventId))accepted.push(event);
      }
      return accepted;
    },
    reset(){launched.clear();},
    get size(){return launched.size;}
  };
}

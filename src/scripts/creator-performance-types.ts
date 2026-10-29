/** One normalized performance, shared by character, screens, light and camera. */
export type CreatorBeat = 'read' | 'think' | 'type' | 'preview' | 'delight' | 'return';
export interface CreatorPointer {
  x:number; y:number; active:number; speed:number;
}
export interface CreatorPose {
  beat:CreatorBeat;
  cycle:number;
  breath:number;
  torsoYaw:number; torsoLean:number; torsoRoll:number;
  headYaw:number; headPitch:number; headRoll:number;
  gazeX:number; gazeY:number;
  blinkLeft:number; blinkRight:number;
  browLeft:number; browRight:number;
  smile:number; mouthOpen:number; cheekRaise:number;
  typing:number; thinking:number; mouse:number; delight:number;
  fingerLeft:number[]; fingerRight:number[];
  chairYaw:number;
  screenReply:number; screenCode:number; screenPreview:number;
}
export interface CreatorPerformer {
  sample:(time:number,pointer:CreatorPointer,dt:number)=>CreatorPose;
  reset:()=>void;
}

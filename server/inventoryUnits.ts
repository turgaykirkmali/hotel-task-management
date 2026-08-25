const UNIT_DIMENSIONS: Record<string, {dimension:string; toBase:number}> = {
  g:{dimension:'mass',toBase:1}, kg:{dimension:'mass',toBase:1000},
  ml:{dimension:'volume',toBase:1}, lt:{dimension:'volume',toBase:1000},
  adet:{dimension:'count',toBase:1}, koli:{dimension:'count',toBase:1}, paket:{dimension:'count',toBase:1}, şişe:{dimension:'count',toBase:1}, kutu:{dimension:'count',toBase:1}, palet:{dimension:'count',toBase:1},
  metre:{dimension:'length',toBase:1}, 'm²':{dimension:'area',toBase:1}, 'm³':{dimension:'cubic',toBase:1}, porsiyon:{dimension:'portion',toBase:1}, demet:{dimension:'bundle',toBase:1}
};
export const INVENTORY_UNITS = Object.keys(UNIT_DIMENSIONS);
export function convertToBase(quantity:number, from:string, base:string){
  if(from===base) return quantity;
  const a=UNIT_DIMENSIONS[from], b=UNIT_DIMENSIONS[base];
  if(!a||!b||a.dimension!==b.dimension) throw new Error(`Birim uyumsuzluğu: ${from} → ${base}`);
  return quantity*a.toBase/b.toBase;
}
export function compatibleUnits(base:string){
  const b=UNIT_DIMENSIONS[base]; if(!b) return [base];
  return Object.entries(UNIT_DIMENSIONS).filter(([,v])=>v.dimension===b.dimension).map(([u])=>u);
}

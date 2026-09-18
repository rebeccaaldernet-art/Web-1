export function validDate(value:string|null){if(!value)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('Use a valid date');const n=Date.parse(value+'T00:00:00Z');if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==value)throw Error('Use a valid date');return n;}
export function fillPeriods(rows:{period:string;orders:number;value:number}[],group:string){
 if(!rows.length)return [];const map=new Map(rows.map(r=>[r.period,r]));const out=[];let d=new Date(rows[0].period+'T00:00:00Z');const end=rows[rows.length-1].period;
 for(let i=0;i<3000&&d.toISOString().slice(0,10)<=end;i++){const period=d.toISOString().slice(0,10);out.push(map.get(period)||{period,orders:0,value:0});if(group==='year')d.setUTCFullYear(d.getUTCFullYear()+1);else if(group==='month')d.setUTCMonth(d.getUTCMonth()+1);else d.setUTCDate(d.getUTCDate()+7);}
 return out;
}

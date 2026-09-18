import {database} from '@/lib/storage';
import {effectivePermissions} from '@/lib/permissions';
export type MentionPerson={id:string;name:string;handle:string};
export type Mentions={all?:boolean;members?:MentionPerson[]};
export async function mentionDirectory():Promise<MentionPerson[]>{
 const result=await database().prepare("SELECT id,name,role,permissions FROM members WHERE status='active' ORDER BY name,id").all<{id:string;name:string;role:string;permissions:string}>();
 const people=result.results.filter(m=>effectivePermissions(m).readMessages);const used=new Set<string>(['all']);
 return people.map(m=>{const base=m.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'member';let handle=base;if(used.has(handle))handle=base+'-'+m.id.replace(/[^a-z0-9]/gi,'').slice(-8).toLowerCase();while(used.has(handle))handle+='-x';used.add(handle);return {id:m.id,name:m.name,handle}});
}
export async function parseMentions(body:string):Promise<Mentions>{
 const handles=new Set(Array.from(body.matchAll(/(?:^|\s)@([a-z0-9][a-z0-9-]*)(?=$|[\s.,!?:;])/gi),m=>m[1].toLowerCase()));
 if(!handles.size)return {};
 const members=(await mentionDirectory()).filter(m=>handles.has(m.handle));
 return {all:handles.has('all'),members};
}

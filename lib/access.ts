import {getChatGPTUser, type ChatGPTUser} from '@/app/chatgpt-auth';
import {effectivePermissions,type Permission} from '@/lib/permissions';
import {database} from '@/lib/storage';
export type Member={id:string;user_id:string|null;email:string|null;name:string;role:'owner'|'admin'|'member';status:'active'|'pending'|'removed';created:number;permissions:string};
export async function membership(user:ChatGPTUser):Promise<Member>{
 const db=database(),email=user.email.trim().toLowerCase();
 let member=await db.prepare('SELECT * FROM members WHERE user_id=?').bind(user.userId).first<Member>();
 if(member){
  if(!member.email){await db.prepare('UPDATE members SET email=?,name=? WHERE id=? AND email IS NULL AND NOT EXISTS (SELECT 1 FROM members WHERE email=?)').bind(email,user.displayName,member.id,email).run();member=await db.prepare('SELECT * FROM members WHERE id=?').bind(member.id).first<Member>();}
  return member!;
 }
 // An email grant can be claimed only by the platform-authenticated account.
 // Bind it to the stable Site user ID once; never reassign an existing binding.
 await db.prepare('UPDATE members SET user_id=?,name=? WHERE email=? AND user_id IS NULL').bind(user.userId,user.displayName,email).run();
 member=await db.prepare('SELECT * FROM members WHERE user_id=?').bind(user.userId).first<Member>();
 if(member)return member;
 await db.prepare("INSERT OR IGNORE INTO members (id,user_id,email,name,role,status,created) SELECT ?,?,?,?,'member',CASE WHEN require_approval=1 THEN 'pending' ELSE 'active' END,? FROM access_settings WHERE id='workspace'").bind(crypto.randomUUID(),user.userId,email,user.displayName,Date.now()).run();
 member=await db.prepare('SELECT * FROM members WHERE user_id=?').bind(user.userId).first<Member>();
 if(!member)throw Error('This email is already linked to a different account.');
 return member;
}
export async function workspaceAccess(permission?:Permission){
 const user=await getChatGPTUser();
 if(!user)return {response:Response.json({error:'Please sign in to open this workspace.'},{status:401})};
 const member=await membership(user);
 if(member.status!=='active')return {response:Response.json({error:member.status==='pending'?'Your access is awaiting approval.':'Your workspace access has been removed.',accessDenied:true},{status:403})};
 if(permission&&!effectivePermissions(member)[permission])return {response:Response.json({error:'You do not have permission to perform this action.'},{status:403})};
 return {user,member};
}

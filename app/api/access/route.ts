import {effectivePermissions,permissionOptions} from '@/lib/permissions';
import {workspaceAccess,type Member} from '@/lib/access';
import {database} from '@/lib/storage';
const noCache={'Cache-Control':'private, no-store'};
export async function GET(){
 try{const auth=await workspaceAccess();if(auth.response)return auth.response;
 const canManage=effectivePermissions(auth.member!).manageMembers;
 const db=database();
 const members=canManage?(await db.prepare("SELECT * FROM members ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,created,email").all<Member>()).results:[];
 const settings=canManage?await db.prepare("SELECT require_approval FROM access_settings WHERE id='workspace'").first<{require_approval:number}>():null;
 return Response.json({me:{...auth.member,effectivePermissions:effectivePermissions(auth.member!)},members:members.map(m=>({...m,effectivePermissions:effectivePermissions(m)})),requireApproval:settings?.require_approval===1},{headers:noCache});
 }catch(e){console.error(e);return Response.json({error:'Workspace access could not load. Please try again.'},{status:503});}
}
export async function POST(req:Request){
 try{
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return Response.json({error:'Invalid request origin.'},{status:403});
 const auth=await workspaceAccess();if(auth.response)return auth.response;
 const actor=auth.member!;if(!effectivePermissions(actor).manageMembers)return Response.json({error:'Only an owner or admin can manage access.'},{status:403});
 let data:Record<string,unknown>;try{const value=await req.json();if(!value||typeof value!=='object'||Array.isArray(value))throw Error();data=value as Record<string,unknown>}catch{return Response.json({error:'Invalid access request.'},{status:400});}
 const db=database();
 if(data.action==='transferOwnership'){
  if(origin!==new URL(req.url).origin)return Response.json({error:'Invalid request origin.'},{status:403});
  if(actor.role!=='owner')return Response.json({error:'Only the current portal owner can transfer ownership.'},{status:403});
  if(typeof data.id!=='string'||data.id===actor.id||typeof data.confirmEmail!=='string')return Response.json({error:'Choose another signed-in member and confirm their email.'},{status:400});
  // Materialize eligibility before updating either row: one atomic statement, no ownerless interval.
  const result=await db.prepare(`WITH eligible AS MATERIALIZED (
   SELECT target.id FROM members target JOIN members actor ON actor.id=?
   WHERE actor.role='owner' AND actor.status='active' AND target.id=?
   AND target.id<>actor.id AND target.role<>'owner' AND target.status='active'
   AND target.user_id IS NOT NULL AND target.email IS NOT NULL
   AND lower(target.email)=? AND (SELECT COUNT(*) FROM members WHERE role='owner')=1
  ) UPDATE members SET role=CASE WHEN id=? THEN 'owner' ELSE 'admin' END,permissions='{}'
   WHERE id IN (?,?) AND EXISTS (SELECT 1 FROM eligible)`)
   .bind(actor.id,data.id,data.confirmEmail.trim().toLowerCase(),data.id,actor.id,data.id).run();
  if(result.meta.changes!==2)return Response.json({error:'Transfer unavailable. The recipient must be an active member who has signed in. Check their email and refresh.'},{status:409});
  return Response.json({ok:true,ownershipTransferred:true},{headers:noCache});
 }
 if(data.action==='approval'){
  if(actor.role!=='owner')return Response.json({error:'Only the owner can change how people join.'},{status:403});
  if(typeof data.requireApproval!=='boolean')return Response.json({error:'Choose an approval setting.'},{status:400});
  await db.prepare("UPDATE access_settings SET require_approval=? WHERE id='workspace' AND EXISTS (SELECT 1 FROM members WHERE id=? AND role='owner' AND status='active')").bind(data.requireApproval?1:0,actor.id).run();
  return Response.json({ok:true},{headers:noCache});
 }
 if(data.action==='permissions'){
  if(actor.role!=='owner')return Response.json({error:'Only the owner can assign permissions.'},{status:403});
  if(typeof data.id!=='string'||!data.permissions||typeof data.permissions!=='object'||Array.isArray(data.permissions))return Response.json({error:'Choose valid permissions.'},{status:400});
  const values=data.permissions as Record<string,unknown>;
  if(Object.keys(values).length!==permissionOptions.length||permissionOptions.some(p=>typeof values[p.key]!=='boolean'))return Response.json({error:'Choose each supported permission.'},{status:400});
  const target=await db.prepare('SELECT * FROM members WHERE id=?').bind(data.id).first<Member>();
  if(!target)return Response.json({error:'Member not found.'},{status:404});
  if(target.role==='owner'||target.id===actor.id)return Response.json({error:'Owner permissions are protected.'},{status:403});
  const permissions=JSON.stringify(effectivePermissions({role:target.role,permissions:JSON.stringify(values)}));
  const result=await db.prepare("UPDATE members SET permissions=? WHERE id=? AND role<>'owner' AND EXISTS (SELECT 1 FROM members actor WHERE actor.id=? AND actor.role='owner' AND actor.status='active')").bind(permissions,target.id,actor.id).run();
  if(!result.meta.changes)return Response.json({error:'Permissions changed. Refresh and try again.'},{status:409});
  return Response.json({ok:true},{headers:noCache});
 }
 if(data.action==='role'&&actor.role!=='owner')return Response.json({error:'Only the owner can change roles.'},{status:403});
 const role=data.role===undefined?'member':data.role;
 if(role!=='member'&&role!=='admin')return Response.json({error:'Choose Member or Admin.'},{status:400});
 if(role==='admin'&&actor.role!=='owner')return Response.json({error:'Only the owner can appoint admins.'},{status:403});
 // Recheck the actor inside each write so a concurrent removal/demotion takes effect.
 const allowed="EXISTS (SELECT 1 FROM members actor WHERE actor.id=? AND actor.status='active' AND (actor.role='owner' OR (COALESCE(json_extract(actor.permissions,'$.manageMembers'),actor.role='admin')=1 AND ?='member')))";
 if(data.action==='add'){
  const email=typeof data.email==='string'?data.email.trim().toLowerCase():'';
  if(email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return Response.json({error:'Enter a valid email address.'},{status:400});
  if(await db.prepare('SELECT id FROM members WHERE email=?').bind(email).first())return Response.json({error:'This person is already listed. Use their access controls below.'},{status:409});
  const result=await db.prepare(`INSERT INTO members (id,user_id,email,name,role,status,created) SELECT ?,NULL,?,?,?,'active',? WHERE ${allowed}`).bind(crypto.randomUUID(),email,email,role,Date.now(),actor.id,role).run();
  if(!result.meta.changes)return Response.json({error:'Your permission changed. Refresh and try again.'},{status:403});
  return Response.json({ok:true},{headers:noCache});
 }
 if(!['role','remove','restore','approve'].includes(String(data.action))||typeof data.id!=='string')return Response.json({error:'Choose a valid member action.'},{status:400});
 const target=await db.prepare('SELECT * FROM members WHERE id=?').bind(data.id).first<Member>();
 if(!target)return Response.json({error:'Member not found.'},{status:404});
 if(target.role==='owner'||target.id===actor.id)return Response.json({error:'You cannot change the owner or your own access.'},{status:403});
 if(actor.role!=='owner'&&(target.role==='admin'||effectivePermissions(target).manageMembers))return Response.json({error:'Only the owner can change another admin.'},{status:403});
 if(data.action==='role'&&target.status!=='active')return Response.json({error:'Approve or restore access before changing this role.'},{status:409});
 if(data.action==='approve'&&target.status!=='pending'||data.action==='restore'&&target.status!=='removed')return Response.json({error:'This access has changed. Refresh and try again.'},{status:409});
 const nextStatus=data.action==='remove'?'removed':'active';
 // Restore and approve as a member; only an explicit owner role change promotes admins.
 const nextRole=data.action==='role'?role:data.action==='remove'?target.role:'member';
 const result=await db.prepare(`UPDATE members SET role=?,status=?,permissions=CASE WHEN ?='role' THEN '{}' WHEN ?='remove' THEN permissions ELSE json_set(permissions,'$.manageMembers',json('false')) END WHERE id=? AND role=? AND status=? AND role<>'owner' AND ${allowed} AND ((role='member' AND COALESCE(json_extract(permissions,'$.manageMembers'),0)=0) OR EXISTS (SELECT 1 FROM members owner WHERE owner.id=? AND owner.role='owner' AND owner.status='active'))`).bind(nextRole,nextStatus,data.action,data.action,target.id,target.role,target.status,actor.id,nextRole,actor.id).run();
 if(!result.meta.changes)return Response.json({error:'Permissions changed. Refresh and try again.'},{status:409});
 return Response.json({ok:true},{headers:noCache});
 }catch(e){console.error(e);return Response.json({error:'Access could not be updated. Refresh and try again.'},{status:503});}
}

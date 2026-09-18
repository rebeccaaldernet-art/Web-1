import {workspaceAccess} from './access';
import {database,bucket} from './storage';
export const lakeJson=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function lakeOwner(){const a=await workspaceAccess();if(a.response)return a;if(a.member.role!=='owner')return {response:lakeJson({error:'Data Lake is restricted to the workspace owner.'},403)};return a}
export async function audit(actor:string,action:string,dataset=''){await database().prepare('INSERT INTO lake_audit (id,actor,action,dataset,created) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),actor,action,dataset,Date.now()).run()}
export type LakeData={columns:string[];rows:(string|number|boolean|null)[][]};
// Documented workbook budget. Per-sheet limits match the previous single-sheet importer; the workbook totals are new.
// The browser worker enforces the same numbers before anything is sent, and the server enforces them again per request.
export const LAKE_LIMITS={fileBytes:5*1024*1024,sheetRows:50000,sheetColumns:100,sheetJsonBytes:7*1024*1024,workbookSheets:25,workbookJsonBytes:64*1024*1024,headerLength:128,cellLength:20000,nameLength:160};
export function validateData(d:any):d is LakeData{return Array.isArray(d?.columns)&&d.columns.length>0&&d.columns.length<=LAKE_LIMITS.sheetColumns&&d.columns.every((s:unknown)=>typeof s==='string'&&s.length>0&&s.length<=LAKE_LIMITS.headerLength)&&new Set(d.columns.map((s:string)=>s.toLowerCase())).size===d.columns.length&&Array.isArray(d.rows)&&d.rows.length<=LAKE_LIMITS.sheetRows&&d.rows.every((r:any)=>Array.isArray(r)&&r.length===d.columns.length&&r.every((v:any)=>v===null||typeof v==='boolean'||typeof v==='string'&&v.length<=LAKE_LIMITS.cellLength||typeof v==='number'&&Number.isFinite(v)))}
export const validSheetName=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=LAKE_LIMITS.nameLength;
export const isId=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
export type Workbook={id:string;name:string;state:string;revision:string;sheet_count:number;bytes:number;created:number;updated:number;owner:string};
export type Sheet={id:string;workbook:string;position:number;name:string;columns:string;row_count:number;bytes:number;object_key:string;created:number;updated:number};
export async function readSheet(id:string){const sheet=await database().prepare("SELECT s.* FROM lake_sheets s JOIN lake_workbooks w ON w.id=s.workbook WHERE s.id=? AND w.state='complete'").bind(id).first<Sheet>();if(!sheet)return null;const o=await bucket().get(sheet.object_key);if(!o)throw Error('Sheet unavailable');return {sheet,data:await o.json<LakeData>()}}
// Every object of a workbook lives under data-lake/<workbook>/ ; the bare key is the legacy single-sheet object.
export async function deleteWorkbookObjects(id:string){const store=bucket();await store.delete('data-lake/'+id);let cursor:string|undefined;do{const page=await store.list({prefix:'data-lake/'+id+'/',limit:500,...(cursor?{cursor}:{})});if(page.objects.length)await store.delete(page.objects.map(o=>o.key));cursor=page.truncated?page.cursor:undefined;}while(cursor)}
export async function hashToken(token:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(b=>b.toString(16).padStart(2,'0')).join('')}
export function csv(data:LakeData){const cell=(v:unknown)=>{let s=v==null?'':String(v);if(typeof v==='string'&&/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'};return '﻿'+[data.columns,...data.rows].map(r=>r.map(cell).join(',')).join('\r\n')}

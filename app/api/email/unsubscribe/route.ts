import {verifyUnsubscribe,audit} from '@/lib/email-campaigns';
import {database} from '@/lib/storage';
// Public endpoint reached from email clients. It is authenticated by the signed link, not by portal sign-in.
// GET only shows a confirmation button so link scanners cannot unsubscribe people; POST performs RFC 8058 one-click.
const page=(title:string,body:string,status=200)=>new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><style>body{font-family:system-ui,sans-serif;max-width:480px;margin:15vh auto;padding:0 16px;color:#1f2a22;background:#fff}button{font:inherit;padding:10px 18px;border-radius:6px;border:1px solid #4e6255;background:#4e6255;color:#fff;cursor:pointer}</style></head><body><h1>${title}</h1>${body}</body></html>`,{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",'Referrer-Policy':'no-referrer'}});
function parse(url:string){const u=new URL(url),r=u.searchParams.get('r')||'',t=u.searchParams.get('t')||'';return {id:/^\d{1,15}$/.test(r)?Number(r):-1,token:t.length<=64?t:''}}
export async function GET(req:Request){const {id,token}=parse(req.url);
 if(id<0||!await verifyUnsubscribe(id,token))return page('Link not valid','<p>This unsubscribe link is incomplete or has expired. Reply to the email and ask to be removed.</p>',400);
 if(id===0)return page('Test email','<p>This link came from a test email, so no address was unsubscribed.</p>');
 return page('Unsubscribe',`<p>Stop receiving marketing email from us?</p><form method="post"><button type="submit">Unsubscribe</button></form>`)}
export async function POST(req:Request){const {id,token}=parse(req.url);
 if(id<0||!await verifyUnsubscribe(id,token))return page('Link not valid','<p>This unsubscribe link is not valid.</p>',400);
 if(id===0)return page('Test email','<p>This link came from a test email, so no address was unsubscribed.</p>');
 try{const db=database(),row=await db.prepare('SELECT email,campaign FROM email_recipients WHERE id=?').bind(id).first<{email:string;campaign:string}>();
  if(row){const now=Date.now();await db.batch([db.prepare("INSERT OR IGNORE INTO email_suppressions (email,reason,created) VALUES (?,'unsubscribe',?)").bind(row.email,now),db.prepare("UPDATE email_recipients SET status='suppressed',updated=? WHERE email=? AND status='queued'").bind(now,row.email)]);await audit('recipient','unsubscribe',row.campaign)}
  return page('You are unsubscribed','<p>You will not receive further marketing email from us.</p>')}
 catch(e){console.error(e);return page('Please try again','<p>We could not process this right now. Please try again shortly.</p>',503)}}

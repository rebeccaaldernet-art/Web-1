import {workspaceAccess} from '@/lib/access';
import {database,initChannels} from '@/lib/storage';
export async function GET(){
 try{const auth=await workspaceAccess('viewAnalytics');if(auth.response)return auth.response;
  await initChannels();const db=database();
  const [messages,files,channels]=await Promise.all([
   db.prepare('SELECT COUNT(*) AS total, COUNT(DISTINCT user_id) AS contributors, COALESCE(SUM(CASE WHEN created >= ? THEN 1 ELSE 0 END),0) AS recent FROM messages').bind(Date.now()-7*86400000).first(),
   db.prepare('SELECT COUNT(*) AS total, COALESCE(SUM(size),0) AS bytes FROM files').first(),
   db.prepare('SELECT c.id,c.name, (SELECT COUNT(*) FROM messages m WHERE m.channel=c.id) AS messages, (SELECT COUNT(*) FROM files f WHERE f.channel=c.id) AS files FROM channels c ORDER BY messages DESC,c.name').all()
  ]);
  return Response.json({messages,files,channels:channels.results},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error(e);return Response.json({error:'Analytics could not load. Please try again.'},{status:503});}
}

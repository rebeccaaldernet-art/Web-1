import { env } from 'cloudflare:workers';
export function database(): D1Database { const db=(env as unknown as {DB:D1Database}).DB; if(!db) throw new Error('Database unavailable'); return db; }
export function bucket(): R2Bucket { const b=(env as unknown as {BUCKET:R2Bucket}).BUCKET; if(!b) throw new Error('File storage unavailable'); return b; }
export const defaultChannels = [ ['general','general','The shared space for team updates, ideas, and everyday conversations.'], ['projects','projects','Keep project conversations and working files together.'], ['design','design','Share creative work, gather feedback, and refine the details.'], ['announcements','announcements','Important news and updates for the whole team.'] ];
export async function initChannels(){const db=database();await db.batch(defaultChannels.map(([id,name,description])=>db.prepare('INSERT OR IGNORE INTO channels (id,name,description,created) VALUES (?,?,?,?)').bind(id,name,description,0)));}

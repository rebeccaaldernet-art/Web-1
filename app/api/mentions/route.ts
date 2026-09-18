import {workspaceAccess} from '@/lib/access';
import {mentionDirectory} from '@/lib/mentions';
export async function GET(){try{const auth=await workspaceAccess('readMessages');if(auth.response)return auth.response;return Response.json({members:await mentionDirectory()},{headers:{'Cache-Control':'private, no-store'}})}catch(e){console.error(e);return Response.json({error:'The member list could not load.'},{status:503})}}

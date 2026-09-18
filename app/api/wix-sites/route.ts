import {workspaceAccess} from '@/lib/access';
import {wixSites} from '@/lib/wix-sites';
export async function GET(){
 try{const auth=await workspaceAccess();if(auth.response)return auth.response;return Response.json({sites:wixSites},{headers:{'Cache-Control':'private, no-store'}})}catch(e){console.error(e);return Response.json({error:'Could not load the Wix dashboard.'},{status:503})}
}

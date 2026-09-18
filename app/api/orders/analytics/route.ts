import {workspaceAccess} from '@/lib/access';
import {effectivePermissions} from '@/lib/permissions';
import {WIX_SALES_URL} from '@/lib/wix-sites';
export async function GET(){
 const auth=await workspaceAccess('viewOrders');if(auth.response)return auth.response;
 if(!effectivePermissions(auth.member!).viewAnalytics)return Response.json({error:'You do not have permission to view analytics.'},{status:403});
 return Response.redirect(WIX_SALES_URL,302);
}

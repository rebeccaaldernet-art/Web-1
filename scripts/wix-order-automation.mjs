// Prepared configuration; run only after the owner approves enabling Wix order delivery.
// Docs: https://dev.wix.com/docs/api-reference/business-management/automations/automations/automations-v2/create-automation
// Trigger/action schemas were read from the connected site's Wix catalog on 2026-09-14.
import {randomUUID} from 'node:crypto';
export function orderAutomation(siteId,token){
 const actionId=randomUUID();
 const fields=['id','orderNumber','createdDate','buyerEmail','billingInfo','lineItems','priceSummary','currency','status','paymentStatus','fulfillmentStatus','buyerNote','shippingInfo'];
 return {automation:{name:'RA Studio — send new orders',origin:'USER',configuration:{status:'ACTIVE',trigger:{appId:'1380b703-ce81-ff05-f115-39571d94dfcd',triggerKey:'wix_e_commerce-order_placed',filters:[]},rootActionIds:[actionId],actions:{[actionId]:{id:actionId,type:'APP_DEFINED',namespace:'ra-studio-orders',appDefinedInfo:{appId:'139ef4fa-c108-8f9a-c7be-d5f492a2c939',actionKey:'webhooks-action',postActionIds:[],skipConditionOrExpressionGroups:[],inputMapping:{url:'https://commonroom-team.rebeccaaldernet.chatgpt.site/api/orders/receive',method:'POST',hasCustomParams:true,customParams:[{key:'siteId',value:siteId},{key:'token',value:token},...fields.map(key=>({key,value:`{{var("${key}")}}`}))]}}}}}}};
}

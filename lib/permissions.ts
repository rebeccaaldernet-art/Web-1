export const permissionOptions=[
 {key:'viewInventory',label:'View inventory',description:'Admins and owner only. View products and availability across Wix websites.'},
 {key:'viewOrders',label:'View website orders',description:'Admins and owner only. View customer and order details received from connected websites.'},
 {key:'readMessages',label:'Read conversations',description:'View and search messages in all channels.'},
 {key:'sendMessages',label:'Send messages',description:'Post messages. Requires Read conversations.'},
 {key:'editOwnMessages',label:'Edit own messages',description:'Edit messages they sent. Requires Read conversations.'},
 {key:'deleteOwnMessages',label:'Delete own messages',description:'Delete their messages and attached files. Requires Read conversations.'},
 {key:'viewFiles',label:'View shared files',description:'See filenames and file details across channels.'},
 {key:'uploadFiles',label:'Upload files',description:'Attach files to messages. Requires Send messages and View shared files.'},
 {key:'downloadFiles',label:'Download files',description:'Download shared files. Requires View shared files.'},
 {key:'createChannels',label:'Create channels',description:'Create new channels for the workspace.'},
 {key:'viewAnalytics',label:'View analytics',description:'See workspace activity and file totals.'},
 {key:'manageMembers',label:'Manage members',description:'Add, approve, remove, and restore ordinary members. Cannot assign permissions or manage admins.'},
] as const;
export type Permission=typeof permissionOptions[number]['key'];
export type Permissions=Record<Permission,boolean>;
export function effectivePermissions(member:{role:string;permissions?:string}):Permissions{
 let saved:Record<string,unknown>={};try{saved=JSON.parse(member.permissions||'{}')}catch{}
 const rights=Object.fromEntries(permissionOptions.map(p=>[p.key,member.role==='owner'?true:typeof saved?.[p.key]==='boolean'?saved[p.key]:p.key!=='manageMembers'||member.role==='admin'])) as Permissions;
 // Role restriction always overrides previously assigned member permissions.
 if(!['owner','admin'].includes(member.role)){rights.viewOrders=false;rights.viewInventory=false;}
 if(!rights.readMessages){rights.sendMessages=false;rights.editOwnMessages=false;rights.deleteOwnMessages=false;}
 if(!rights.sendMessages||!rights.viewFiles)rights.uploadFiles=false;
 if(!rights.viewFiles)rights.downloadFiles=false;
 return rights;
}

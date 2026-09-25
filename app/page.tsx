import {membership} from '@/lib/access';
import Workspace from './workspace';
import { requireChatGPTUser, chatGPTSignOutPath } from './chatgpt-auth';
export const dynamic='force-dynamic';
export default async function Home(){const user=await requireChatGPTUser('/');const member=await membership(user);if(member.status!=='active')return <main className="access-blocked"><h1>{member.status==='pending'?'Awaiting approval':'Workspace access removed'}</h1><p>{member.status==='pending'?'An admin needs to approve your access to RA Studio.':'Contact the workspace owner if you need access restored.'}</p><a className="outline-button" href="/">Check access again</a><a href={chatGPTSignOutPath("/")}>Sign out</a></main>;return <Workspace initialName={user.displayName} currentUserId={user.userId}/>}

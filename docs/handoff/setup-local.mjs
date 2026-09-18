// Local helper only. Does not deploy, provision resources, seed owners or migrate databases.
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('./source/',import.meta.url));
const args=new Set(process.argv.slice(2));
const allowed=new Set(['--install','--check','--build','--dev']);
if([...args].some(a=>!allowed.has(a)))throw Error('Use --install, --check, --build or --dev.');
if(!existsSync(root+'package.json'))throw Error('Extract the complete package; source/package.json is required.');
const [major,minor]=process.versions.node.split('.').map(Number);
if(major<22||(major===22&&minor<13))throw Error('Node 22.13.0 or newer is required.');
function run(command,parameters){const r=spawnSync(command,parameters,{cwd:root,stdio:'inherit',shell:process.platform==='win32'});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1);}
if(!args.size){console.log('Run: node setup-local.mjs --install --check --build\nRequires pnpm 11.19.0 on PATH. No hosting, secrets or database migrations are configured by this helper.\nSee source/README.md for local migrations and development login.');process.exit(0);}
if(args.has('--install'))run('pnpm',['install','--frozen-lockfile']);
if(args.has('--check')){run('pnpm',['exec','tsc','--noEmit']);run(process.execPath,['tests/access.mjs']);run(process.execPath,['tests/lake-file-worker.mjs']);}
if(args.has('--build'))run('pnpm',['run','build']);
if(args.has('--dev'))run('pnpm',['run','dev']);

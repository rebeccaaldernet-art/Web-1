// Cloudflare Access JWT verification used for sign-in on independent Cloudflare hosting.
import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';import ts from 'typescript';
const source=ts.transpileModule(fs.readFileSync('lib/cloudflare-access.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {verifyAccessJwt,normalizeTeamDomain}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const team='https://rastudio.cloudflareaccess.com',aud='a1b2c3d4e5f6';
const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const other=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const jwks={keys:[{...publicKey.export({format:'jwk'}),kid:'k1',alg:'RS256',use:'sig'}]};
let certFetches=0;
const fetchFn=async url=>{assert.equal(url,team+'/cdn-cgi/access/certs');certFetches++;return Response.json(jwks)};
const b64=v=>Buffer.from(typeof v==='string'?v:JSON.stringify(v)).toString('base64url');
const now=Math.floor(Date.now()/1000);
function token(claims={},{kid='k1',alg='RS256',key=privateKey}={}){const h=b64({alg,kid,typ:'JWT'}),p=b64({iss:team,aud:[aud],sub:'user-123',email:'Rebecca@Example.com',type:'app',iat:now,exp:now+3600,...claims});return `${h}.${p}.${crypto.sign('sha256',Buffer.from(`${h}.${p}`),key).toString('base64url')}`}
const cfg={teamDomain:team+'/',aud};
assert.deepEqual(await verifyAccessJwt(token(),cfg,fetchFn),{userId:'cf-access:user-123',email:'rebecca@example.com'});
assert.equal(certFetches,1);await verifyAccessJwt(token(),cfg,fetchFn);assert.equal(certFetches,1,'keys are cached');
for(const [label,t] of [
 ['missing',null],['garbage','abc'],['wrong audience',token({aud:['other']})],['wrong issuer',token({iss:'https://evil.cloudflareaccess.com'})],
 ['expired',token({exp:now-10})],['not yet valid',token({nbf:now+3600})],['signed by another key',token({},{key:other.privateKey})],
 ['alg none',`${b64({alg:'none',kid:'k1'})}.${b64({iss:team,aud:[aud],sub:'x',email:'a@b.c',exp:now+60})}.`],['HS256',token({},{alg:'HS256'})],
 ['service token (no user)',token({sub:'',email:undefined})],['no email',token({email:undefined})],
 ['tampered payload',(()=>{const [h,,s]=token().split('.');return `${h}.${b64({iss:team,aud:[aud],sub:'admin',email:'owner@example.com',exp:now+3600})}.${s}`})()],
])assert.equal(await verifyAccessJwt(t,cfg,fetchFn),null,label);
// Unknown key id triggers at most one refresh per minute.
const before=certFetches;await verifyAccessJwt(token({},{kid:'unknown'}),cfg,fetchFn);await verifyAccessJwt(token({},{kid:'unknown'}),cfg,fetchFn);assert.ok(certFetches-before<=1);
// Misconfiguration fails closed.
assert.equal(await verifyAccessJwt(token(),{teamDomain:'',aud},fetchFn),null);
assert.equal(await verifyAccessJwt(token(),{teamDomain:'https://evil.example.com',aud},fetchFn),null);
assert.equal(await verifyAccessJwt(token(),{teamDomain:team,aud:''},fetchFn),null);
assert.equal(normalizeTeamDomain('https://RaStudio.cloudflareaccess.com/'),'https://rastudio.cloudflareaccess.com');
// The portal ignores oai-* identity headers in Access mode.
const auth=fs.readFileSync('app/chatgpt-auth.ts','utf8');assert.ok(auth.indexOf('if (cloudflareAccessMode())')<auth.indexOf('requestHeaders.get(USER_ID_HEADER)'));
console.log('PASS: valid Access JWT accepted and keys cached; missing, malformed, wrong audience/issuer, expired, not-yet-valid, foreign-key, alg none/HS256, service-token, email-less and tampered tokens rejected; refresh throttled; misconfiguration fails closed; oai headers bypassed in Access mode.');

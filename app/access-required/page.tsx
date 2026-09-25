// Shown on independent Cloudflare hosting when a request reaches the portal without a valid Cloudflare Access
// sign-in, for example if Access is not yet protecting this hostname or its settings do not match.
export const dynamic='force-dynamic';
export default function AccessRequired(){return <main className="access-blocked">
 <h1>Sign-in required</h1><p>This portal signs you in with Cloudflare Access. If you keep seeing this page, the site owner needs to finish the Access setup (team domain and application audience) for this address.</p>{/* A full page load, not client navigation, so Cloudflare Access can run its sign-in. */}
 {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
 <a className="outline-button" href="/">Try again</a></main>}

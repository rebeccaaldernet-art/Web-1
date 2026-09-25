import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAccessJwt } from "@/lib/cloudflare-access";

// Independent Cloudflare hosting sets AUTH_MODE=cloudflare-access (see docs/cloudflare-deploy.md). In that mode the
// oai-* headers below are ignored, because outside Sites anyone could send them; identity comes only from a
// verified Cloudflare Access JWT. Missing Access settings fail closed: nobody is signed in.
type AuthEnv = { AUTH_MODE?: string; CF_ACCESS_TEAM_DOMAIN?: string; CF_ACCESS_AUD?: string };
const authEnv = () => env as unknown as AuthEnv;
export const cloudflareAccessMode = () => authEnv().AUTH_MODE === "cloudflare-access";
const ACCESS_REQUIRED_PATH = "/access-required";
const ACCESS_LOGOUT_PATH = "/cdn-cgi/access/logout";

export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

const USER_ID_HEADER = "oai-authenticated-user-id";
const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER =
  "oai-authenticated-user-full-name-encoding";
const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";
const SIGN_IN_PATH = "/signin-with-chatgpt";
const SIGN_OUT_PATH = "/signout-with-chatgpt";
const CALLBACK_PATH = "/callback";

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();
  if (cloudflareAccessMode()) {
    const identity = await verifyAccessJwt(requestHeaders.get("cf-access-jwt-assertion"), {
      teamDomain: authEnv().CF_ACCESS_TEAM_DOMAIN || "",
      aud: authEnv().CF_ACCESS_AUD || "",
    }).catch(() => null);
    return identity ? { userId: identity.userId, displayName: identity.email, email: identity.email, fullName: null } : null;
  }
  const userId = requestHeaders.get(USER_ID_HEADER);
  const email = requestHeaders.get(USER_EMAIL_HEADER);
  if (!userId || !email) return null;

  const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
  const fullName =
    encodedFullName &&
    requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8
      ? safeDecodeURIComponent(encodedFullName)
      : null;

  return {
    userId,
    displayName: fullName ?? email,
    email,
    fullName,
  };
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  redirect(cloudflareAccessMode() ? ACCESS_REQUIRED_PATH : chatGPTSignInPath(returnTo));
}

export function chatGPTSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function chatGPTSignOutPath(returnTo = "/"): string {
  if (cloudflareAccessMode()) return ACCESS_LOGOUT_PATH;
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local") return "/";
  if (isReservedAuthPath(url.pathname)) return "/";

  return `${url.pathname}${url.search}${url.hash}`;
}

function isReservedAuthPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname === SIGN_OUT_PATH ||
    pathname === CALLBACK_PATH
  );
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createHash, randomBytes } from "node:crypto";

const FLOW_COOKIE = "dots_oidc_flow";
const SESSION_COOKIE = "dots_session";
const FLOW_MAX_AGE_SECONDS = 10 * 60;
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

interface AuthConfig {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
  scope: string;
}

interface OidcFlowCookie {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
  createdAt: number;
}

interface TokenResponse {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

export interface AuthUser {
  sub: string;
  email?: string;
  name?: string;
  preferredUsername?: string;
  givenName?: string;
  familyName?: string;
}

interface UserInfoResponse {
  sub: string;
  email?: string;
  name?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
}

export interface AuthSession {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  expiresAt: number;
  user: AuthUser;
}

interface CallbackBody {
  code?: string;
  state?: string;
}

const flows = new Map<string, OidcFlowCookie>();
const sessions = new Map<string, AuthSession>();

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing from .env`);
  return value;
}

function authConfig(): AuthConfig {
  const appOrigin = requiredEnv("APP_ORIGIN");

  return {
    issuerUrl: requiredEnv("OIDC_ISSUER"),
    clientId: requiredEnv("OIDC_CLIENT_ID"),
    clientSecret: requiredEnv("OIDC_CLIENT_SECRET"),
    redirectUri: process.env.OIDC_REDIRECT_URI || `${appOrigin}/auth/callback`,
    postLogoutRedirectUri:
      process.env.OIDC_POST_LOGOUT_REDIRECT_URI ?? `${appOrigin}/login`,
    scope: process.env.OIDC_SCOPE ?? "openid email profile",
  };
}

function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

function sha256Base64Url(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

function parseCookies(req: FastifyRequest): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};

  return Object.fromEntries(
    header
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const separator = item.indexOf("=");
        if (separator === -1) return [item, ""];
        return [item.slice(0, separator), decodeURIComponent(item.slice(separator + 1))];
      }),
  );
}

function appendSetCookie(reply: FastifyReply, cookie: string): void {
  const current = reply.getHeader("Set-Cookie");
  if (!current) {
    reply.header("Set-Cookie", cookie);
    return;
  }

  reply.header(
    "Set-Cookie",
    Array.isArray(current) ? [...current, cookie] : [String(current), cookie],
  );
}

function setHttpOnlyCookie(
  reply: FastifyReply,
  name: string,
  value: string,
  maxAgeSeconds: number,
): void {
  appendSetCookie(
    reply,
    [
      `${name}=${encodeURIComponent(value)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${maxAgeSeconds}`,
    ].join("; "),
  );
}

function clearCookie(reply: FastifyReply, name: string): void {
  appendSetCookie(
    reply,
    [`${name}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"].join("; "),
  );
}

function safeReturnTo(value: unknown): string {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function authUrl(config: AuthConfig, flow: OidcFlowCookie): string {
  const url = new URL(`${config.issuerUrl}/protocol/openid-connect/auth`);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scope,
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: sha256Base64Url(flow.codeVerifier),
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

function logoutUrl(config: AuthConfig, idToken: string): string {
  const url = new URL(`${config.issuerUrl}/protocol/openid-connect/logout`);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    id_token_hint: idToken,
    post_logout_redirect_uri: config.postLogoutRedirectUri,
  }).toString();
  return url.toString();
}

async function exchangeCodeForToken(
  config: AuthConfig,
  code: string,
  codeVerifier: string,
): Promise<TokenResponse> {
  const res = await fetch(`${config.issuerUrl}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      code,
      code_verifier: codeVerifier,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token exchange failed with HTTP ${res.status}: ${await res.text()}`);
  }

  return res.json() as Promise<TokenResponse>;
}

async function refreshAccessToken(
  config: AuthConfig,
  refreshToken: string,
): Promise<TokenResponse> {
  const res = await fetch(`${config.issuerUrl}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed with HTTP ${res.status}: ${await res.text()}`);
  }

  return res.json() as Promise<TokenResponse>;
}

async function fetchUserInfo(config: AuthConfig, accessToken: string): Promise<AuthUser> {
  const res = await fetch(`${config.issuerUrl}/protocol/openid-connect/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`UserInfo request failed with HTTP ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as UserInfoResponse;
  return {
    sub: data.sub,
    email: data.email,
    name: data.name,
    preferredUsername: data.preferred_username,
    givenName: data.given_name,
    familyName: data.family_name,
  };
}

function createSession(reply: FastifyReply, token: TokenResponse, user: AuthUser): void {
  const sessionId = randomToken();
  const expiresIn = token.expires_in ?? SESSION_MAX_AGE_SECONDS;

  sessions.set(sessionId, {
    accessToken: token.access_token,
    idToken: token.id_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + expiresIn * 1000,
    user,
  });

  setHttpOnlyCookie(reply, SESSION_COOKIE, sessionId, SESSION_MAX_AGE_SECONDS);
}

function deleteFlow(req: FastifyRequest, reply: FastifyReply): void {
  const flowId = parseCookies(req)[FLOW_COOKIE];
  if (flowId) flows.delete(flowId);
  clearCookie(reply, FLOW_COOKIE);
}

function getFlow(req: FastifyRequest, reply: FastifyReply): OidcFlowCookie | null {
  const flowId = parseCookies(req)[FLOW_COOKIE];
  if (!flowId) return null;

  const flow = flows.get(flowId);
  if (!flow) {
    clearCookie(reply, FLOW_COOKIE);
    return null;
  }

  if (Date.now() - flow.createdAt > FLOW_MAX_AGE_SECONDS * 1000) {
    flows.delete(flowId);
    clearCookie(reply, FLOW_COOKIE);
    return null;
  }

  return flow;
}

/** Marge sous laquelle on rafraîchit par avance, pour éviter qu'un token expire pendant l'appel amont. */
const ACCESS_TOKEN_EXPIRY_MARGIN_MS = 10_000;

export async function getAuthSession(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthSession | null> {
  const sessionId = parseCookies(req)[SESSION_COOKIE];
  if (!sessionId) return null;

  const session = sessions.get(sessionId);
  if (!session) {
    clearCookie(reply, SESSION_COOKIE);
    return null;
  }

  if (session.expiresAt > Date.now() + ACCESS_TOKEN_EXPIRY_MARGIN_MS) {
    return session;
  }

  if (!session.refreshToken) {
    sessions.delete(sessionId);
    clearCookie(reply, SESSION_COOKIE);
    return null;
  }

  try {
    const token = await refreshAccessToken(authConfig(), session.refreshToken);
    const refreshed: AuthSession = {
      ...session,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? session.refreshToken,
      idToken: token.id_token ?? session.idToken,
      expiresAt: Date.now() + (token.expires_in ?? SESSION_MAX_AGE_SECONDS) * 1000,
    };
    sessions.set(sessionId, refreshed);
    return refreshed;
  } catch (err) {
    req.log.warn({ err }, "Access token refresh failed");
    sessions.delete(sessionId);
    clearCookie(reply, SESSION_COOKIE);
    return null;
  }
}

function clearLocalSession(req: FastifyRequest, reply: FastifyReply): AuthSession | null {
  const sessionId = parseCookies(req)[SESSION_COOKIE];
  const session = sessionId ? sessions.get(sessionId) ?? null : null;
  if (sessionId) sessions.delete(sessionId);
  clearCookie(reply, SESSION_COOKIE);
  return session;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { returnTo?: string } }>("/api/auth/login", async (req, reply) => {
    const config = authConfig();
    const flowId = randomToken();
    const flow: OidcFlowCookie = {
      state: randomToken(),
      nonce: randomToken(),
      codeVerifier: randomToken(64),
      returnTo: safeReturnTo(req.query.returnTo),
      createdAt: Date.now(),
    };

    flows.set(flowId, flow);
    setHttpOnlyCookie(reply, FLOW_COOKIE, flowId, FLOW_MAX_AGE_SECONDS);
    return reply.status(302).header("Location", authUrl(config, flow)).send();
  });

  app.post<{ Body: CallbackBody }>("/api/auth/callback", async (req, reply) => {
    const flow = getFlow(req, reply);
    if (!flow) {
      return reply.code(400).send({ error: "OIDC login flow expired" });
    }

    if (!req.body?.code || req.body.state !== flow.state) {
      deleteFlow(req, reply);
      return reply.code(400).send({ error: "Invalid OIDC callback" });
    }

    try {
      const config = authConfig();
      const token = await exchangeCodeForToken(config, req.body.code, flow.codeVerifier);
      const user = await fetchUserInfo(config, token.access_token);
      deleteFlow(req, reply);
      createSession(reply, token, user);
      return reply.send({ authenticated: true, user, returnTo: flow.returnTo });
    } catch (err) {
      req.log.error(err);
      deleteFlow(req, reply);
      return reply.code(502).send({ error: "OIDC callback failed" });
    }
  });

  app.get("/api/auth/me", async (req, reply) => {
    const session = await getAuthSession(req, reply);
    if (!session) {
      return reply.send({ authenticated: false });
    }

    return reply.send({ authenticated: true, user: session.user });
  });

  app.post("/api/auth/logout", async (req, reply) => {
    clearLocalSession(req, reply);
    return reply.send({ ok: true });
  });

  app.get("/api/auth/logout/sso", async (req, reply) => {
    const session = clearLocalSession(req, reply);
    const config = authConfig();

    if (!session?.idToken) {
      return reply.status(302).header("Location", config.postLogoutRedirectUri).send();
    }

    return reply.status(302).header("Location", logoutUrl(config, session.idToken)).send();
  });
}

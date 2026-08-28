import { OAuth2Client, CodeChallengeMethod } from 'google-auth-library';
import { createDriveOAuthHandler, createRpcStore, CALLBACK_URL, MASTER_ID, TEST_EMAIL, DRIVE_SCOPE } from '../_shared/drive-oauth.mjs';

const clientId = Deno.env.get('GOOGLE_WEB_CLIENT_ID');
const clientSecret = Deno.env.get('GOOGLE_WEB_CLIENT_SECRET');
function client() {
  return new OAuth2Client({ clientId, clientSecret, redirectUri: CALLBACK_URL,
    transporterOptions: { timeout: 15000, retry: false } });
}
async function driveRead(path: string, accessToken: string) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` }, method: 'GET',
    redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('drive_read_failed');
  return response.json();
}
const google = {
  async authorizationUrl(state: string, verifier: string) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const challenge = btoa(String.fromCharCode(...new Uint8Array(hash))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
    const url = new URL(client().generateAuthUrl({ access_type: 'offline', scope: DRIVE_SCOPE,
      prompt: 'consent', login_hint: TEST_EMAIL, include_granted_scopes: false, state,
      code_challenge: challenge, code_challenge_method: CodeChallengeMethod.S256 }));
    url.searchParams.set('trigger_onepick', 'true');
    url.searchParams.set('allow_multiple', 'false');
    url.searchParams.set('file_ids', MASTER_ID);
    url.searchParams.set('mimetypes', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return url.toString();
  },
  async exchange(code: string, verifier: string) {
    return (await client().getToken({ code, codeVerifier: verifier, redirect_uri: CALLBACK_URL })).tokens;
  },
  async refresh(refreshToken: string) {
    const oauth = client();
    oauth.setCredentials({ refresh_token: refreshToken });
    return (await oauth.refreshAccessToken()).credentials;
  },
  identity: (token: string) => driveRead('about?fields=user(emailAddress)', token),
  metadata: (token: string) => driveRead(`files/${MASTER_ID}?fields=id,name,mimeType,modifiedTime,size,trashed&supportsAllDrives=true`, token),
};

Deno.serve(createDriveOAuthHandler({ clientId, clientSecret,
  encryptionKey: Deno.env.get('DRIVE_OAUTH_ENCRYPTION_KEY'),
  adminSecret: Deno.env.get('DRIVE_OAUTH_ADMIN_SECRET'),
  store: createRpcStore(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')),
  google,
}));

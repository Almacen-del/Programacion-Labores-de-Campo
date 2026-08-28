import { OAuth2Client } from 'google-auth-library';
import { MASTER_ID } from '../_shared/drive-oauth.mjs';
import { createSyncHandler, createSyncStore, createStoredDrive, SyncError } from '../_shared/master-sync.mjs';
import { parseMasterBytes } from '../../../src/importer/parse-master.ts';

const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const clientId = Deno.env.get('GOOGLE_WEB_CLIENT_ID');
const clientSecret = Deno.env.get('GOOGLE_WEB_CLIENT_SECRET');
async function driveGet(query: string, token: string) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${MASTER_ID}${query}`, {
    method: 'GET', headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new SyncError('GOOGLE_ACCESS_FAILED');
  return response;
}
const google = {
  async refresh(refreshToken: string) {
    const client = new OAuth2Client({ clientId, clientSecret, transporterOptions: { timeout: 15000, retry: false } });
    client.setCredentials({ refresh_token: refreshToken });
    return (await client.refreshAccessToken()).credentials;
  },
  async metadata(token: string) {
    return (await driveGet('?fields=id,mimeType,modifiedTime,size,version,md5Checksum,trashed&supportsAllDrives=true', token)).json();
  },
  download: (token: string) => driveGet('?alt=media&supportsAllDrives=true', token),
};
Deno.serve(createSyncHandler({
  syncSecret: Deno.env.get('MASTER_SYNC_SECRET'), adminSecret: Deno.env.get('DRIVE_OAUTH_ADMIN_SECRET'),
  store: createSyncStore(serviceKey),
  openDrive: createStoredDrive({ clientId, encryptionKey: Deno.env.get('DRIVE_OAUTH_ENCRYPTION_KEY'), serviceKey, google }),
  parse: parseMasterBytes,
}));

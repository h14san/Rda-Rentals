// delete-account: permanently deletes the caller's own account.
//
// An Edge Function, not SQL, for two reasons. Removing an auth user needs the
// service role, which can never be in the app. And files in Storage must be
// removed through the Storage API: deleting storage.objects rows in SQL leaves
// the files behind, which for identity documents is exactly the wrong failure.
//
// It can only ever delete the account whose token made the request. There is
// no id in the body to get wrong or to forge.
//
// Order matters: files first, the user last. If it fails halfway the account
// still exists and the person can try again; the reverse would leave files
// that belong to nobody and that nobody can ask to have removed.
//
// Deploy: npx supabase functions deploy delete-account

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/**
 * Removes every file under `{uid}/` in a bucket. Both buckets file things as
 * {uid}/{listing or case id}/{file}, so this walks exactly two levels.
 */
async function emptyFolder(admin: SupabaseClient, bucket: string, uid: string) {
  const { data: folders, error } = await admin.storage.from(bucket).list(uid, { limit: 1000 });
  if (error) throw new Error(`${bucket}: ${error.message}`);

  for (const folder of folders ?? []) {
    const prefix = `${uid}/${folder.name}`;
    const { data: files, error: listError } = await admin.storage
      .from(bucket)
      .list(prefix, { limit: 1000 });
    if (listError) throw new Error(`${bucket}: ${listError.message}`);

    // An entry with no files under it is itself a file sitting at {uid}/name.
    const paths = files?.length ? files.map((f) => `${prefix}/${f.name}`) : [prefix];
    const { error: removeError } = await admin.storage.from(bucket).remove(paths);
    if (removeError) throw new Error(`${bucket}: ${removeError.message}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const authorization = req.headers.get('Authorization') ?? '';

  // As the caller: who they are, and whether anything stands in the way.
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });

  const { data: who, error: whoError } = await asUser.auth.getUser();
  if (whoError || !who.user) return json({ error: 'Sign in first.' }, 401);
  const uid = who.user.id;

  const { data: blocker, error: blockerError } = await asUser.rpc('account_deletion_blocker');
  if (blockerError) {
    console.error('delete-account: blocker check failed', blockerError.message);
    return json({ error: 'Could not check your account. Try again.' }, 502);
  }
  if (typeof blocker === 'string' && blocker) return json({ error: blocker }, 409);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  try {
    await emptyFolder(admin, 'listing-images', uid);
    await emptyFolder(admin, 'verification-evidence', uid);
  } catch (e) {
    console.error('delete-account: storage cleanup failed', e instanceof Error ? e.message : e);
    return json({ error: 'Could not remove your photos. Nothing was deleted; try again.' }, 502);
  }

  // Deleting the auth user cascades to the profile and, from there, to the
  // listings, favorites, bookings, conversations and everything else keyed on
  // it. Messages they sent in other people's conversations stay, unsigned.
  const { error: deleteError } = await admin.auth.admin.deleteUser(uid);
  if (deleteError) {
    console.error('delete-account: user delete failed', deleteError.message);
    return json({ error: 'Could not delete your account. Try again.' }, 502);
  }

  return json({ deleted: true });
});

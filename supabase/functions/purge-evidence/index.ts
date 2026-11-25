// purge-evidence: deletes identity and ownership documents whose retention
// period has ended (30 days after a decision, 90 after an unanswered request
// for changes; the rule is in evidence_due_for_purge()).
//
// Called once a night by pg_cron through pg_net, which has no user token, so
// it runs without JWT verification and must be safe for anyone to call. It is:
// the request carries nothing, and what is due is decided in the database. An
// outside caller can only make tonight's deletion happen a little earlier.
//
// Files first, rows second, as in delete-account. If the row update fails the
// rows point at files that are already gone, and the next run removes them
// again (removing a missing file is not an error) and then the rows. The
// reverse order could leave a document in Storage with nothing pointing at it.
//
// Deploy: npx supabase functions deploy purge-evidence --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'verification-evidence';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type Due = { evidence_id: string; case_id: string; storage_path: string };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    console.error('purge-evidence is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return json({ error: 'Misconfigured.' }, 503);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  let removed = 0;
  // A few batches per call; anything left waits for tomorrow night.
  for (let batch = 0; batch < 5; batch++) {
    const { data, error } = await db.rpc('evidence_due_for_purge', { p_limit: 500 });
    if (error) {
      console.error('purge-evidence: listing due files failed', error.message);
      return json({ error: 'Could not list documents.' }, 502);
    }
    const due = (data ?? []) as Due[];
    if (due.length === 0) break;

    const { error: removeError } = await db.storage
      .from(BUCKET)
      .remove(due.map((d) => d.storage_path));
    if (removeError) {
      console.error('purge-evidence: storage remove failed', removeError.message);
      return json({ error: 'Could not remove documents.', removed }, 502);
    }

    const { error: markError } = await db.rpc('mark_evidence_purged', {
      p_evidence_ids: due.map((d) => d.evidence_id),
    });
    if (markError) {
      console.error('purge-evidence: marking rows failed', markError.message);
      return json({ error: 'Removed files but could not record it.', removed }, 502);
    }
    removed += due.length;
  }

  return json({ removed });
});

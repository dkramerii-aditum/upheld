import { NextResponse } from 'next/server';
import { assertRlsRole } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Render health check. Fails unless the app is connected as the restricted
// upheld_app role, so a misconfigured database connection never serves.
export async function GET() {
  try {
    await assertRlsRole();
    return NextResponse.json({ ok: true, database: 'row level security enforced' });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}

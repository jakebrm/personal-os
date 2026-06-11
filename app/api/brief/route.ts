import { NextResponse } from 'next/server';
import { composeBrief } from '@/lib/brief';

// Preview the morning brief without sending (session or x-api-secret auth
// via middleware). Useful for checking format: GET /api/brief
export async function GET() {
  const text = await composeBrief();
  return NextResponse.json({ text });
}

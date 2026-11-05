import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  await createServerSupabaseClient().auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}

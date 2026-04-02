import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const INSFORGE_URL = process.env.NEXT_PUBLIC_INSFORGE_URL!;

export async function PATCH(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("insforge-session")?.value;

    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const profile = body.profile;

    if (!profile) {
      return NextResponse.json({ error: "No profile data" }, { status: 400 });
    }

    const response = await fetch(`${INSFORGE_URL}/api/auth/profiles/current`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ profile }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error("[/api/profile] Backend error:", response.status, responseText);
      return NextResponse.json(
        { error: responseText || `Backend error ${response.status}` },
        { status: response.status }
      );
    }

    // Parse response safely
    let data: Record<string, unknown> = {};
    if (responseText) {
      try {
        data = JSON.parse(responseText);
      } catch {
        console.error("[/api/profile] Non-JSON response:", responseText);
      }
    }

    // Update the insforge-user cookie with new profile data
    const userCookieValue = cookieStore.get("insforge-user")?.value;
    if (userCookieValue) {
      try {
        const user = JSON.parse(userCookieValue);
        user.profile = data.profile ?? profile;
        const res = NextResponse.json({ success: true, profile: user.profile });
        res.cookies.set({
          name: "insforge-user",
          value: JSON.stringify(user),
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 7 * 24 * 60 * 60,
          path: "/",
        });
        return res;
      } catch {
        // Cookie parse failed
      }
    }

    return NextResponse.json({ success: true, ...data });
  } catch (err) {
    console.error("[/api/profile] Unhandled error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("insforge-session")?.value;

    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const userCookieValue = cookieStore.get("insforge-user")?.value;
    if (userCookieValue) {
      try {
        const user = JSON.parse(userCookieValue);
        return NextResponse.json({ user });
      } catch {
        // Fall through
      }
    }

    return NextResponse.json({ user: null });
  } catch (err) {
    console.error("[/api/profile GET] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

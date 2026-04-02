import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const INSFORGE_URL = process.env.NEXT_PUBLIC_INSFORGE_URL!;

/**
 * POST /api/profile/avatar — Upload avatar via InsForge storage
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("insforge-session")?.value;

    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const userCookieValue = cookieStore.get("insforge-user")?.value;
    if (!userCookieValue) {
      return NextResponse.json({ error: "User data not found" }, { status: 401 });
    }

    let userId: string;
    try {
    const user = JSON.parse(userCookieValue);
    userId = user.id;
    } catch {
      return NextResponse.json({ error: "Invalid user data" }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const ext = file.name.split(".").pop() || "jpg";
    const filename = `${userId}/avatar.${ext}`;

    // Step 1: Get upload strategy from InsForge
    const strategyResponse = await fetch(
      `${INSFORGE_URL}/api/storage/buckets/avatars/upload-strategy`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename,
          contentType: file.type || "image/jpeg",
          size: file.size,
        }),
      }
    );

    if (!strategyResponse.ok) {
      const text = await strategyResponse.text();
      console.error("[avatar] Strategy error:", strategyResponse.status, text);
      return NextResponse.json(
        { error: `Upload strategy failed: ${text}` },
        { status: strategyResponse.status }
      );
    }

    const strategy = await strategyResponse.json();

    // Step 2: Upload file based on strategy method
    if (strategy.method === "presigned") {
      // S3 presigned: POST with multipart form including fields
      const s3Form = new FormData();
      for (const [key, value] of Object.entries(strategy.fields as Record<string, string>)) {
        s3Form.append(key, value);
      }
      s3Form.append("file", file);

      const uploadResponse = await fetch(strategy.uploadUrl, {
        method: "POST",
        body: s3Form,
      });

      if (!uploadResponse.ok) {
        const text = await uploadResponse.text();
        console.error("[avatar] S3 upload error:", uploadResponse.status, text);
        return NextResponse.json({ error: "Upload to storage failed" }, { status: 502 });
      }

      // Step 3: Confirm upload (S3 only)
      if (strategy.confirmRequired && strategy.confirmUrl) {
        const confirmResponse = await fetch(`${INSFORGE_URL}${strategy.confirmUrl}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            size: file.size,
            contentType: file.type || "image/jpeg",
          }),
        });

        if (!confirmResponse.ok) {
          const text = await confirmResponse.text();
          console.error("[avatar] Confirm error:", confirmResponse.status, text);
        }
      }
    } else {
      // Direct/local: PUT with multipart form to uploadUrl
      const uploadForm = new FormData();
      uploadForm.append("file", file);

      const uploadResponse = await fetch(`${INSFORGE_URL}${strategy.uploadUrl}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: uploadForm,
      });

      if (!uploadResponse.ok) {
        const text = await uploadResponse.text();
        console.error("[avatar] Direct upload error:", uploadResponse.status, text);
        return NextResponse.json(
          { error: `Upload failed: ${text}` },
          { status: uploadResponse.status }
        );
      }
    }

    // Build the public URL using the key from strategy
    const objectKey = strategy.key || filename;
    const publicUrl = `${INSFORGE_URL}/api/storage/buckets/avatars/objects/${encodeURIComponent(objectKey)}`;
    const cacheBustedUrl = `${publicUrl}?v=${Date.now()}`;

    // Update profile with avatar URL
    const existingUser = JSON.parse(userCookieValue) as {
      id: string;
      profile?: Record<string, unknown> | null;
    };
    const mergedProfile = {
      ...(existingUser.profile ?? {}),
      avatar_url: cacheBustedUrl,
    };

    const profileResponse = await fetch(
      `${INSFORGE_URL}/api/auth/profiles/current`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ profile: mergedProfile }),
      }
    );

    if (!profileResponse.ok) {
      const text = await profileResponse.text();
      console.error("[avatar] Profile update error:", profileResponse.status, text);
    }

    // Update cookie with avatar URL
    const user = JSON.parse(userCookieValue);

    if (profileResponse.ok) {
      user.profile = mergedProfile;
    } else {
      user.profile = mergedProfile;
    }

    const res = NextResponse.json({
      success: true,
      avatarUrl: cacheBustedUrl,
    });

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
  } catch (err) {
    console.error("[avatar] Unhandled error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

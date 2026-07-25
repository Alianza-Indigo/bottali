import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userProfiles, users } from "@/db/schema";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { ProfileForm } from "@/components/profile/ProfileForm";

export const metadata = { title: "Perfil" };

export default async function ProfilePage() {
  const user = await requireCurrentUser();
  const rows = await db
    .select({ email: users.email, displayName: userProfiles.displayName, locale: userProfiles.locale, timezone: userProfiles.timezone })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(users.id, user.id))
    .limit(1);

  const profile = rows[0];

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-xl font-semibold text-ink">Mi perfil</h1>
      <ProfileForm
        email={profile?.email ?? ""}
        displayName={profile?.displayName ?? ""}
        locale={profile?.locale ?? "es"}
        timezone={profile?.timezone ?? "UTC"}
      />
    </div>
  );
}

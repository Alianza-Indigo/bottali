import { requireCurrentUser } from "@/lib/auth/current-user";
import { isMfaEnabled } from "@/lib/auth/session";
import { MfaSetupPanel } from "@/components/profile/MfaSetupPanel";

export const metadata = { title: "Verificación en dos pasos" };

export default async function MfaSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ required?: string }>;
}) {
  const user = await requireCurrentUser();
  const { required } = await searchParams;
  const enabled = await isMfaEnabled(user.id);

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-xl font-semibold text-ink">Verificación en dos pasos (MFA)</h1>
      <MfaSetupPanel initialEnabled={enabled} requiredForAdmin={required === "admin"} />
    </div>
  );
}

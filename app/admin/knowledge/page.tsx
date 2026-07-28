import { redirect } from "next/navigation";

export const metadata = { title: "Conocimiento por herramienta — Admin" };

export default function AdminKnowledgePage() {
  redirect("/admin/tools");
}

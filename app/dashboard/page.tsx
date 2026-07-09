import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { FolderManager } from "@/components/folder-manager";
import styles from "./dashboard.module.css";

type DashboardPageProps = {
  searchParams?: {
    folder?: string;
  };
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/");
  }

  const activeFolderId = searchParams?.folder ?? null;

  return (
    <main className={styles.page}>
      <FolderManager userEmail={data.user.email ?? ""} activeFolderId={activeFolderId} />
    </main>
  );
}

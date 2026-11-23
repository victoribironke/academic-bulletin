import { redirect } from "next/navigation";

/** "Reports" in the top bar opens the one report so far (task B8). */
export default function ReportsPage() {
  redirect("/reports/registry");
}

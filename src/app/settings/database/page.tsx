import { redirect } from "next/navigation";

// Moved into System Management.
export default function DatabasePage() {
  redirect("/settings/system?tab=database");
}

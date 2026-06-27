import { redirect } from "next/navigation";

// The analyze entry is now the dashboard itself (it loads the sample by default
// and offers "try it on your own data" inline).
export default function AnalyzePage() {
  redirect("/dashboard");
}

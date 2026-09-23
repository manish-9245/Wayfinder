import Link from "next/link";
import { Lost } from "@/components/illustrations";

export default function NotFound() {
  return (
    <div className="card empty" style={{ marginTop: 40 }}>
      <Lost label="A dashed arch with its checkpoint wandering off" />
      <h1 className="display" style={{ margin: "8px 0 0" }}>No verdict here.</h1>
      <p>This path does not exist on the gateway. The console and docs are one click away.</p>
      <p style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        <Link className="primary btn-link" href="/">Back home</Link>
        <Link className="ghost btn-link" href="/console">Open console</Link>
      </p>
    </div>
  );
}

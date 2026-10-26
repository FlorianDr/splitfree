import { getDb } from "~/lib/db/client.server";

// Liveness + DB-readability probe for container healthchecks (see docker-compose). No auth and no
// data — just confirms the server is up and can read SQLite. 200 = healthy, 503 = not.
export function loader() {
  try {
    getDb().prepare("SELECT 1").get();
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "error" }, { status: 503 });
  }
}

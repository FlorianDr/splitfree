import type { Route } from "./+types/impressum";
import { LegalPage } from "~/components/legal-page";
import { pageMeta } from "~/lib/meta";

// Legal notice required for the instance we operate (§ 5 DDG). The operator details below are the
// real, identifiable person running this instance — keep them current. A self-hosted copy is run by
// its own operator and must carry that operator's own Impressum instead.
export function meta({ matches }: Route.MetaArgs) {
  return pageMeta(matches, {
    title: "Impressum",
    description: "Legal notice (Impressum) for the splitfree instance operated by us.",
    path: "/impressum",
  });
}

export default function Impressum() {
  return (
    <LegalPage title="Impressum">
      <p>
        Legal notice (Impressum) under § 5 DDG (Digitale-Dienste-Gesetz) for the splitfree instance
        operated by us. If you use an instance hosted by someone else, that operator — not we — is
        responsible for it and provides their own Impressum.
      </p>

      <h2>Diensteanbieter / Operator</h2>
      <p>
        Florian Dreschner
        <br />
        Hasenheide 74
        <br />
        10967 Berlin
        <br />
        Germany
      </p>

      <h2>Kontakt / Contact</h2>
      <p>
        Email: <a href="mailto:code@dreschner.eu">code@dreschner.eu</a>
        <br />
        Website: <a href="https://dreschner.eu">dreschner.eu</a>
      </p>

      <h2>Verantwortlich für den Inhalt / Responsible for content</h2>
      <p>Florian Dreschner (address as above).</p>

      <h2>Nature of the service</h2>
      <p>
        splitfree is a free, non-commercial, open-source project. It is provided at no charge, with
        no advertising and no paid features. Your use of it is governed by our{" "}
        <a href="/terms">Terms of Service</a>; how we handle personal data is described in our{" "}
        <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>Verbraucherstreitbeilegung / Consumer dispute resolution</h2>
      <p>
        We are neither obliged nor willing to participate in dispute-resolution proceedings before a
        consumer arbitration board (Verbraucherschlichtungsstelle).
      </p>
    </LegalPage>
  );
}

import type { Route } from "./+types/terms";
import { LegalPage } from "~/components/legal-page";
import { pageMeta } from "~/lib/meta";

// NOTE: This is a plain-language starter template, not legal advice — have it reviewed before
// relying on it. Contact: code@dreschner.eu. Governing law: Berlin, Germany.
const LAST_UPDATED = "June 3, 2026";

export function meta({ matches }: Route.MetaArgs) {
  return pageMeta(matches, {
    title: "Terms of Service",
    description: "The terms that govern your use of splitfree.",
    path: "/terms",
  });
}

export default function Terms() {
  return (
    <LegalPage title="Terms of Service" lastUpdated={LAST_UPDATED}>
      <p>
        These Terms of Service ("Terms") govern your use of splitfree (the "Service"), a free
        application for tracking shared expenses and settling up. By creating an account or using
        the Service, you agree to these Terms. If you do not agree, please do not use the Service.
      </p>

      <h2>1. The Service</h2>
      <p>
        splitfree lets you record bills and payments among a group and shows a simplified plan for
        settling balances. The settle-up plan is a convenience calculation, not a payment service:
        splitfree does not hold, move, or transfer money, and does not provide financial,
        accounting, tax, or legal advice. You are responsible for the accuracy of the amounts you
        enter and for any actual payments you make to one another.
      </p>

      <h2>2. Eligibility</h2>
      <p>
        You must be at least 16 years old (or the age of digital consent in your country, if
        higher) to use the Service. By using it, you confirm that you meet this requirement.
      </p>

      <h2>3. Your account</h2>
      <p>
        Sign-in is passwordless, using a one-time code emailed to you or a passkey you register. You
        are responsible for keeping access to your email account and passkey secure, and for all
        activity that occurs under your account. Tell us promptly if you believe your account has
        been accessed without your permission.
      </p>

      <h2>4. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>use the Service for any unlawful, fraudulent, or harmful purpose;</li>
        <li>upload data you do not have the right to share, or another person's personal data without a lawful basis;</li>
        <li>attempt to disrupt, overload, probe, or gain unauthorized access to the Service or its infrastructure;</li>
        <li>misrepresent your identity or impersonate others.</li>
      </ul>

      <h2>5. Your data</h2>
      <p>
        You retain ownership of the bills, payments, and contact details you enter. You grant us the
        limited right to store and process that data only to operate the Service for you. How we
        handle personal data is described in our <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>6. Free service; availability</h2>
      <p>
        The Service is provided free of charge, with no paywalled features. We may change, suspend,
        or discontinue any part of it at any time, and we do not guarantee that it will be
        uninterrupted, error-free, or available at any particular time.
      </p>

      <h2>7. Open source and self-hosting</h2>
      <p>
        splitfree is open-source software and can be self-hosted. The source code is governed by
        its own software license, separate from these Terms. These Terms apply to the instance of
        the Service operated by us; if you use a copy hosted by someone else, that operator — not
        we — is responsible for it.
      </p>

      <h2>8. Disclaimer of warranties</h2>
      <p>
        The Service is provided <strong>"as is" and "as available," without warranties of any
        kind</strong>, whether express or implied, including fitness for a particular purpose,
        merchantability, accuracy of calculations, and non-infringement, to the fullest extent
        permitted by law.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, we will not be liable for any indirect, incidental,
        or consequential damages, or for any loss of data, arising from your use of the Service.
        Because the Service is provided free of charge, our total liability to you for any claim
        relating to the Service is limited to the amount you paid for it — which is zero. Nothing in
        these Terms limits liability that cannot be limited under applicable law.
      </p>

      <h2>10. Termination</h2>
      <p>
        You may stop using the Service and request deletion of your account at any time. We may
        suspend or terminate access if you breach these Terms or use the Service in a way that
        risks harm to others or to the Service.
      </p>

      <h2>11. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. If we make material changes, we will update
        the "Last updated" date above and, where appropriate, notify you by email. Continuing to use
        the Service after changes take effect means you accept the updated Terms.
      </p>

      <h2>12. Governing law</h2>
      <p>
        These Terms are governed by the laws of the Federal Republic of Germany, without regard to its
        conflict of law rules. The courts of Berlin, Germany will have exclusive jurisdiction over any
        dispute, unless mandatory local consumer-protection law gives you the right to bring a claim
        elsewhere.
      </p>

      <h2>13. Contact</h2>
      <p>
        Questions about these Terms? Email us at{" "}
        <a href="mailto:code@dreschner.eu">code@dreschner.eu</a>.
      </p>
    </LegalPage>
  );
}

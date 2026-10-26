import type { Route } from "./+types/privacy";
import { LegalPage } from "~/components/legal-page";
import { pageMeta } from "~/lib/meta";

// NOTE: This is a plain-language starter template, not legal advice — have it reviewed before
// relying on it. Contact: code@dreschner.eu. Keep the "Self-hosting" section honest for how your
// specific instance is run. This Policy is written to match what the app actually stores: account
// email, an optional display name, passkey public keys, the shared-expense data you enter (bills,
// who paid/owes, payments and their notes), the contacts you add by email, and a security/audit log
// that records IP addresses. If you change what your instance logs, update §1 and §4 to match.
const LAST_UPDATED = "October 26, 2026";

// Where users send rights requests (access, export, deletion) and any privacy question. These
// actions are handled manually over email — there is no self-service delete/export in the app yet.
const CONTACT_EMAIL = "code@dreschner.eu";

export function meta({ matches }: Route.MetaArgs) {
  return pageMeta(matches, {
    title: "Privacy Policy",
    description:
      "How splitfree handles your data: your email, optional display name, the shared expenses you enter, and a security log.",
    path: "/privacy",
  });
}

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated={LAST_UPDATED}>
      <p>
        This Privacy Policy explains what personal data splitfree (the "Service", "we", "us")
        collects and how we use it. We collect only what the Service needs to let you split expenses
        and settle up — there is no advertising, profiling, or cross-site tracking.
      </p>

      <h2>1. What we collect</h2>
      <p>We collect and store the following personal data:</p>
      <ul>
        <li>
          <strong>Your email address</strong> — provided when you sign in. It identifies your
          account and is where we send sign-in codes.
        </li>
        <li>
          <strong>An optional display name</strong> — if you set one, it is shown to the other
          people you share expenses with instead of your email. You can change or clear it at any
          time in Settings.
        </li>
        <li>
          <strong>Passkey public keys</strong> — if you choose to register a passkey, we store its
          public credential (used to verify sign-in). This never includes any private key or
          biometric data, which stays on your device.
        </li>
        <li>
          <strong>Your shared-expense data</strong> — the bills you record (title, amount,
          currency and date), who paid and who owes what, and the settle-up payments you record
          (amount, date and an optional free-text note). This is the core of the Service. Note that
          a bill title or payment note is free text and may contain whatever you type into it, so
          avoid putting sensitive details there.
        </li>
        <li>
          <strong>Contacts you add</strong> — the email address (and a name, if you provide one) of
          each person you add to a bill or payment, so the Service can track who owes whom. See §2.
        </li>
        <li>
          <strong>Groups</strong> — a group's name, the email addresses of its members, who created
          it and who added whom, and its join link. Every member of a group can see the group's name
          and its members' email addresses. See §2.
        </li>
        <li>
          <strong>Security logs</strong> — to protect accounts and prevent abuse, we keep an audit
          log of security-relevant events (such as sign-ins, failed sign-ins, and creating or
          deleting bills and payments). These entries record a timestamp, the event type, the
          account involved, and the <strong>IP address</strong> the request came from.
        </li>
        <li>
          <strong>Sign-in and email limits</strong> — to stop automated abuse of sign-in emails, we
          record each email we send (sign-in codes, invitations) with the time and a shortened form
          of the requesting IP address (the network it belongs to, not the full address), and the
          email address a sign-in code was requested for.
        </li>
        <li>
          <strong>Bot check on email sign-in</strong> — when you ask for a sign-in code by email, a
          check by Cloudflare Turnstile runs in your browser to tell people from automated scripts.
          It processes your IP address and technical information about your browser and device (see
          §5). It runs only on that form, not on the rest of the Service.
        </li>
      </ul>
      <p>
        We do <strong>not</strong> collect phone numbers, payment-card details, or bank-account
        information, and we use no advertising or tracking cookies. We set two essential cookies: one
        that keeps you signed in, and a short-lived one that carries a one-time notice (such as
        "Signed in") to the next page.
      </p>

      <h2>2. People you add to expenses</h2>
      <p>
        splitfree only works if it knows who shared an expense. When you add someone to a bill or a
        payment, you give us their email address (and optionally a name), and we store it as a
        contact. If that person does not already have an account, we send them a one-time email
        letting them know they were added and inviting them to sign in to see what they owe.
      </p>
      <p>
        You can also save people as a <strong>group</strong>. A group stores only their email
        addresses — saving a group does not create contacts and sends nobody an email; people are
        invited only when a bill includes them. Groups are visible only to their members: everyone in
        a group sees its name and the email addresses of the other members (names are shown only to
        people who already share an expense). A group's join link lets anyone holding it join after
        signing in; it expires after four weeks and the group's creator can reset or turn it off. You
        can leave a group at any time.
      </p>
      <p>
        Please only add people who expect to share expenses with you. If you are added to an expense
        and would like your data removed, contact us at the address in §11 — even if you never
        create an account — and we will handle your request.
      </p>

      <h2>3. How we use your data</h2>
      <ul>
        <li>
          <strong>To run the Service</strong> — store your bills and payments and compute balances
          and the simplified settle-up plan.
        </li>
        <li>
          <strong>Login</strong> — sending one-time sign-in codes and authenticating you.
        </li>
        <li>
          <strong>Security and abuse prevention</strong> — the audit log (including IP addresses)
          lets us investigate suspicious activity and rate-limit abuse, such as someone adding many
          unknown people in a short time.
        </li>
        <li>
          <strong>Updates</strong> — occasional emails about meaningful changes to the Service. You
          can opt out of update emails at any time, and doing so will not affect your ability to log
          in.
        </li>
      </ul>
      <p>We never sell your data or share it for marketing by others.</p>

      <h2>4. Legal bases (where GDPR applies)</h2>
      <p>
        We process your account email and your shared-expense data to provide the Service you asked
        for (<strong>performance of a contract</strong>). We keep security logs, including IP
        addresses, and process the details of the people you add on the basis of our{" "}
        <strong>legitimate interest</strong> in keeping accounts secure, preventing abuse (including
        the bot check on email sign-in, which stops scripts from making us email strangers), and
        making the Service work as intended. We send update emails on the basis of legitimate
        interest or your consent, depending on your jurisdiction, and you can withdraw at any time.
      </p>

      <h2>5. Who we share it with</h2>
      <p>
        We use <a href="https://resend.com">Resend</a> as our email delivery provider to send
        sign-in codes, invite emails, and update emails. The relevant email addresses (and, in an
        invite, the inviter's name and the bill title) are shared with Resend only to deliver those
        messages, under a data processing agreement that limits Resend to processing them on our
        instructions.
      </p>
      <p>
        Resend processes this data in the United States, so this involves a transfer of personal
        data outside the EU/EEA. That transfer is covered by the European Commission's Standard
        Contractual Clauses under Resend's data processing terms — an approved safeguard for
        transfers to countries without an EU adequacy decision.
      </p>
      <p>
        Our servers, and the continuously updated backup copy of our database, are hosted by a
        hosting provider in the European Union, which processes the
        data on our instructions under a data processing agreement.
      </p>
      <p>
        The bot check on email sign-in is provided by{" "}
        <a href="https://www.cloudflare.com/turnstile-privacy-policy/">Cloudflare Turnstile</a>{" "}
        (Cloudflare, Inc., USA). When you use that form, Cloudflare receives your IP address and
        technical information about your browser and device to decide whether the request comes from
        a person. Cloudflare processes this data on our behalf to provide the check, and as an
        independent controller to improve its bot detection, as described in its Turnstile privacy
        addendum. This involves a transfer to the United States, covered by the EU-U.S. Data Privacy
        Framework, with the Standard Contractual Clauses in Cloudflare's data processing terms as a
        fallback.
      </p>
      <p>
        We may also disclose data if required by law. We do not otherwise share your personal data
        with third parties.
      </p>

      <h2>6. How long we keep it</h2>
      <p>
        We keep your account email, display name, passkey credentials, and your shared-expense data
        for as long as your account is active. Security-log entries (including IP addresses) are
        kept for 90 days, and sign-in and email-limit records for 2 days, for security and
        abuse-prevention purposes; they may be retained longer where we need them to comply with a
        legal obligation or to establish or defend legal claims.
      </p>
      <p>
        When you delete your account or ask us to erase your data, we remove or anonymize your
        personal data, including your membership in any groups. Some records that are part of an expense shared with other people may be
        retained in anonymized form so that those other people's balances stay accurate, and we may
        retain limited information where the law requires it.
      </p>

      <h2>7. Your rights</h2>
      <p>
        Depending on where you live, you may have the right to access, correct, export, or delete
        your personal data, to object to or restrict its processing, and to unsubscribe from update
        emails. You can edit or clear your display name and manage your passkeys yourself in
        Settings. For everything else — including account deletion, a copy of your data, or any
        other request above — email us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we will action it. You also have
        the right to complain to your local data-protection authority.
      </p>

      <h2>8. Children</h2>
      <p>
        The Service is not directed to children under 16 (or the age of digital consent in your
        country), and we do not knowingly collect their personal data.
      </p>

      <h2>9. Self-hosting</h2>
      <p>
        splitfree is open source and can be self-hosted. If you use an instance run by someone
        else, the operator of that instance — not us — controls your data and is responsible for its
        own privacy practices. This Policy covers only the instance operated by us.
      </p>

      <h2>10. Changes to this Policy</h2>
      <p>
        We may update this Policy from time to time. If we make material changes, we will update the
        "Last updated" date above and, where appropriate, notify you by email.
      </p>

      <h2>11. Contact</h2>
      <p>
        For any privacy question or to exercise your rights — including requesting account deletion
        or a copy of your data — email us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}

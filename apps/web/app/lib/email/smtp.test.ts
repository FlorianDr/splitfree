import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type AddressInfo } from "node:net";
import { createTransport } from "nodemailer";
import { classifySendError, smtpTransportOptions } from "./smtp.server.ts";

test("no SMTP_HOST means no transport", () => {
  assert.equal(smtpTransportOptions({ port: 465 }, true), null);
  assert.equal(smtpTransportOptions({ host: "", port: 465 }, false), null);
});

test("security follows the port unless set", () => {
  const tls = smtpTransportOptions({ host: "smtp.resend.com", port: 465, user: "resend", password: "re_x" }, true);
  assert.equal(tls?.secure, true);
  assert.equal(tls?.requireTLS, false);
  assert.deepEqual(tls?.auth, { user: "resend", pass: "re_x" });

  const starttls = smtpTransportOptions({ host: "smtp.example.com", port: 587 }, true);
  assert.equal(starttls?.secure, false);
  assert.equal(starttls?.requireTLS, true, "never falls back to plaintext");
  assert.equal(starttls?.auth, undefined);

  const forced = smtpTransportOptions({ host: "smtp.example.com", port: 2587, security: "tls" }, true);
  assert.equal(forced?.secure, true);
});

test("plaintext SMTP is dev-only", () => {
  const dev = smtpTransportOptions({ host: "localhost", port: 1025, security: "none" }, false);
  assert.equal(dev?.ignoreTLS, true);
  assert.equal(dev?.requireTLS, false);
  assert.throws(() => smtpTransportOptions({ host: "localhost", port: 1025, security: "none" }, true), /none/);
});

test("user and password come together", () => {
  assert.throws(() => smtpTransportOptions({ host: "h", port: 465, user: "u" }, false), /both/);
  assert.throws(() => smtpTransportOptions({ host: "h", port: 465, password: "p" }, false), /both/);
});

test("classifySendError", () => {
  assert.equal(classifySendError(new Error("getaddrinfo ENOTFOUND")), "error");
  assert.equal(classifySendError(undefined), "error");
  assert.equal(classifySendError({ responseCode: 451, response: "451 try again later" }), "transient");
  assert.equal(classifySendError({ responseCode: 550, response: "550 mailbox unavailable" }), "rejected");
  assert.equal(classifySendError({ responseCode: 550, response: "550 5.4.5 Daily user sending limit exceeded" }), "quota");
  assert.equal(classifySendError({ responseCode: 429, response: "429 daily_quota_exceeded" }), "quota");
});

/** A scripted plaintext SMTP server: records commands and the DATA payload; `rcpt` sets its reply. */
async function fakeSmtp(rcpt = "250 OK") {
  const seen: string[] = [];
  let data = "";
  const server = createServer((socket) => {
    let buf = "";
    let inData = false;
    socket.write("220 fake ESMTP\r\n");
    socket.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let i: number;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            socket.write("250 queued\r\n");
          } else data += line + "\n";
          continue;
        }
        seen.push(line);
        const verb = line.split(" ")[0]?.toUpperCase();
        if (verb === "EHLO") socket.write("250-fake\r\n250 AUTH PLAIN LOGIN\r\n");
        else if (verb === "AUTH") socket.write("235 ok\r\n");
        else if (verb === "MAIL") socket.write("250 OK\r\n");
        else if (verb === "RCPT") socket.write(`${rcpt}\r\n`);
        else if (verb === "DATA") {
          inData = true;
          socket.write("354 go\r\n");
        } else if (verb === "QUIT") socket.end("221 bye\r\n");
        else socket.write("502 no\r\n");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return { port, seen, data: () => data, close: () => server.close() };
}

test("sends through nodemailer with these options, header injection encoded away", async () => {
  const srv = await fakeSmtp();
  try {
    const opts = smtpTransportOptions(
      { host: "127.0.0.1", port: srv.port, security: "none", user: "resend", password: "re_secret" },
      false,
    );
    assert.ok(opts);
    await createTransport(opts).sendMail({
      from: "splitfree <login@splitfree.cash>",
      to: "friend@example.com",
      subject: "Ana added you to “Pizza”\r\nBcc: evil@example.com",
      text: "hello",
    });
    assert.ok(srv.seen.some((l) => l.startsWith("AUTH PLAIN")));
    assert.ok(srv.seen.includes("MAIL FROM:<login@splitfree.cash>"));
    assert.ok(srv.seen.includes("RCPT TO:<friend@example.com>"));
    assert.equal(srv.seen.filter((l) => l.startsWith("RCPT")).length, 1, "no smuggled recipient");
    assert.doesNotMatch(srv.data(), /^Bcc:/im);
  } finally {
    srv.close();
  }
});

test("a rejected recipient surfaces as `rejected`", async () => {
  const srv = await fakeSmtp("550 5.1.1 no such user");
  try {
    const opts = smtpTransportOptions({ host: "127.0.0.1", port: srv.port, security: "none" }, false);
    assert.ok(opts);
    const err = await createTransport(opts)
      .sendMail({ from: "a@example.com", to: "b@example.com", subject: "s", text: "t" })
      .then(() => null, (e: unknown) => e);
    assert.equal(classifySendError(err), "rejected");
  } finally {
    srv.close();
  }
});

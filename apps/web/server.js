// Production entry for `react-router-serve`: the server build, plus `allowedActionOrigins` read at
// runtime. Behind a TLS proxy (Caddy) the app sees `http://<host>` while browsers send
// `Origin: https://<host>`, and React Router ≥ 7.18.3 compares scheme + host + port before any action
// runs, so every form POST would be refused with a 400. Allowing the configured public host (from the
// same WEBAUTHN_ORIGIN passkeys use) keeps actions working; the domain is not baked into the image.
// A local export shadows the same-named one from `export *`.
export * from "./build/server/index.js";

const origin = process.env.WEBAUTHN_ORIGIN;
export const allowedActionOrigins = origin ? [new URL(origin).host] : [];

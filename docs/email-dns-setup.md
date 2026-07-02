# alignocrm.com Email & DNS Setup

_Completed July 1, 2026. This documents how email (send + receive) was configured for `alignocrm.com` using Namecheap Private Email, and what remains for app-transactional email._

## The Setup at a Glance

- **Domain registrar:** Namecheap (`alignocrm.com`)
- **Mailbox provider:** Namecheap Private Email (Launch plan) — mailbox `info@alignocrm.com`
- **DNS host:** ⚠️ **Vercel, not Namecheap.** The domain's nameservers point to `ns1/ns2.vercel-dns.com`, so ALL DNS records must be managed at Vercel (team `app-build-26`). Anything added in Namecheap's "Advanced DNS" tab has no effect.

That last point is the key gotcha: Namecheap's Private Email setup guides assume Namecheap BasicDNS and its automatic "Mail Settings → Private Email" option. Because DNS is delegated to Vercel, every record had to be created manually there instead.

## Steps Taken

### 1. Identified where DNS actually lives

Namecheap → Domain List → alignocrm.com → **Nameservers** showed `Custom DNS: ns1.vercel-dns.com / ns2.vercel-dns.com`. Confirmed with:

```bash
npx vercel dns ls alignocrm.com
```

### 2. Added the Private Email records via the Vercel CLI

Records per [Namecheap's Private Email DNS guide](https://www.namecheap.com/support/knowledgebase/article.aspx/1338/2176/namecheap-private-email-dns-records-for-domains-on-namecheap-basicpremium-nameservers/):

```bash
# Receiving (MX)
npx vercel dns add alignocrm.com '' MX mx1.privateemail.com 10
npx vercel dns add alignocrm.com '' MX mx2.privateemail.com 10

# Sending authorization (SPF)
npx vercel dns add alignocrm.com '' TXT "v=spf1 include:spf.privateemail.com ~all"

# Deliverability policy (DMARC — monitoring mode to start)
npx vercel dns add alignocrm.com _dmarc TXT "v=DMARC1; p=none; rua=mailto:info@alignocrm.com"

# Mail client auto-configuration
npx vercel dns add alignocrm.com mail CNAME privateemail.com
npx vercel dns add alignocrm.com autodiscover CNAME privateemail.com
npx vercel dns add alignocrm.com autoconfig CNAME privateemail.com
npx vercel dns add alignocrm.com _autodiscover._tcp SRV 0 0 443 privateemail.com
```

### 3. Added DKIM (email signing)

The DKIM key is generated per-subscription by Namecheap:

1. Namecheap → **Private Email** → alignocrm.com → **Manage** → scroll to **Email Security → DKIM** → **Show DKIM**
2. Host is `privateemail._domainkey` (subscriptions purchased after June 2, 2026 use this selector; older ones use `default._domainkey`)
3. Copy the **DNS Record** value (`v=DKIM1;k=rsa;p=MIIB...`) and add it:

```bash
npx vercel dns add alignocrm.com privateemail._domainkey TXT "<paste the full DKIM value>"
```

### 4. Verified everything resolves

```bash
dig MX alignocrm.com +short                                 # 10 mx1.privateemail.com / 10 mx2.privateemail.com
dig TXT alignocrm.com +short                                # v=spf1 include:spf.privateemail.com ~all
dig TXT privateemail._domainkey.alignocrm.com +short        # v=DKIM1;k=rsa;p=...
dig TXT _dmarc.alignocrm.com +short                         # v=DMARC1; p=none; ...
dig CNAME autodiscover.alignocrm.com +short                 # privateemail.com
dig SRV _autodiscover._tcp.alignocrm.com +short             # 0 0 443 privateemail.com
```

All records were live immediately (Vercel DNS propagates fast). Namecheap's own activation check can take **up to 4 hours** after records appear.

## Using the Mailbox

- **Webmail:** https://privateemail.com — log in as `info@alignocrm.com`
- **Mail apps** (iPhone / Apple Mail / Outlook): add the account with the address + password; the autodiscover records configure servers automatically
- **Manual settings** if ever needed: IMAP `mail.privateemail.com:993` (SSL), SMTP `mail.privateemail.com:465` (SSL)

## How This Coexists With App Email (Resend)

The CRM sends transactional email (team invites, workflow emails) through **Resend**, which is a separate sending path from the mailbox:

- Resend verifies domains using its **own** records on a `send.` subdomain plus its own DKIM selector — none of them collide with the Private Email records above
- The app's sender address is controlled by the `EMAIL_FROM` env var (falls back to the legacy sender until set)

### App email — completed July 1, 2026

1. ✅ Separate free Resend account for Aligno, with **`contact.alignocrm.com`** verified as its sending domain (subdomain keeps app-transactional reputation separate from the mailbox)
2. ✅ `RESEND_API_KEY` swapped in `.env.local` and Vercel production env
3. ✅ `EMAIL_FROM="AlignoCRM <noreply@contact.alignocrm.com>"` set in both
4. ✅ **InsForge SMTP** configured via `insforge.toml` + `npx @insforge/cli config apply` — sign-up verification emails now send from `noreply@contact.alignocrm.com` through `smtp.resend.com`. The key is stored as the InsForge secret `SMTP_PASSWORD` and referenced as `env(SMTP_PASSWORD)` in the toml (literal secrets are rejected).
5. ✅ Both OAuth redirect URLs allowed via `auth.allowed_redirect_urls` in `insforge.toml` — production and `http://localhost:8003` work simultaneously (the dashboard UI only shows one field, but the config API accepts an array)
6. ✅ Verified with a live send: Resend → `info@alignocrm.com` mailbox, status `delivered`

The declarative config lives at the repo root: **`insforge.toml`** (safe to commit — the SMTP password is an env reference, not a literal). Manage with `npx @insforge/cli config plan / apply`.

## DMARC Hardening (later)

DMARC is currently `p=none` (monitor only) — correct for a brand-new domain. After a few weeks of clean sending:

1. `v=DMARC1; p=quarantine; pct=25; rua=mailto:info@alignocrm.com`
2. Ramp `pct` up, then move to `p=reject`

Update with:

```bash
npx vercel dns rm <record-id>   # find id via: npx vercel dns ls alignocrm.com
npx vercel dns add alignocrm.com _dmarc TXT "v=DMARC1; p=quarantine; pct=25; rua=mailto:info@alignocrm.com"
```

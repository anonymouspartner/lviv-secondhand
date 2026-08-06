# Email DNS — receive mail + stop spoofing (`lviv­secondhand.com`)

Goal: let `@lvivsecondhand.com` **receive** email, and make it impossible for
anyone to **spoof** `From: …@lvivsecondhand.com`.

The domain currently sends **no** mail of its own, so the strongest and
simplest posture is: forward incoming mail to an existing inbox, and publish
records that say "nothing is authorised to send as this domain." All of this is
free and stays on Cloudflare.

Everything below is done in the **Cloudflare dashboard** for `lvivsecondhand.com`
(DNS is on Cloudflare — nameservers `*.ns.cloudflare.com`).

---

## 1. Receive email — Cloudflare Email Routing (free)

Cloudflare → your domain → **Email** → **Email Routing** → **Get started**.

1. Cloudflare offers to **add the required DNS records automatically** — accept.
   It creates **3 MX records** (`*.mx.cloudflare.net`) and a starter SPF TXT.
   The exact MX hostnames/priorities are generated per-zone; let Cloudflare set
   them.
2. Add **destination address** = your real inbox (e.g. your Gmail) and click the
   verification link Cloudflare emails you.
3. Add **custom addresses** (routes), each forwarding to that inbox:
   - `hello@lvivsecondhand.com`  → your inbox   (public contact address)
   - `dmarc@lvivsecondhand.com`  → your inbox   (receives DMARC reports; see §4)
   - *(optional)* enable **catch-all** → your inbox, so any `*@lvivsecondhand.com`
     still lands somewhere.

After this, mail to the domain is delivered (forwarded) instead of bouncing.

> Cloudflare Email Routing is **receive/forward only** — it does not send
> outbound mail as your domain. Replies come from your own inbox
> (e.g. your Gmail address). See §5 for sending *as* the domain.

---

## 2. SPF — authorise nothing to send as us

There must be **exactly one** SPF record (a `TXT` on the root). Email Routing may
have auto-added `v=spf1 include:_spf.mx.cloudflare.net ~all`. **Edit that one
record** (don't add a second) to:

| Type | Name | Value |
|---|---|---|
| TXT | `@` (root) | `v=spf1 -all` |

`-all` = a hard "no server is authorised to send mail as this domain."
This does **not** affect receiving (that's MX), and it does **not** break
Email Routing forwarding (Cloudflare rewrites the envelope sender via SRS, so
forwarded mail is checked against Cloudflare's domain, not ours).

## 3. DKIM — declare "no valid signing keys"

Belt-and-suspenders for a non-sending domain: publish an empty DKIM key so any
DKIM-signed mail claiming to be us fails.

| Type | Name | Value |
|---|---|---|
| TXT | `*._domainkey` | `v=DKIM1; p=` |

(When you later set up real sending, the provider gives you a *specific* selector
like `google._domainkey` — an exact record wins over this wildcard, so this is
safe to keep.)

## 4. DMARC — reject anything that fails, and get reports

| Type | Name | Value |
|---|---|---|
| TXT | `_dmarc` | `v=DMARC1; p=reject; rua=mailto:dmarc@lvivsecondhand.com; adkim=s; aspf=s; fo=1` |

- `p=reject` — receivers throw away forgeries outright. Safe here because the
  domain has no legitimate outbound mail to accidentally block.
- `rua=mailto:dmarc@lvivsecondhand.com` — aggregate reports. It's an address **at
  the same domain**, so no cross-domain authorisation is needed; route it to your
  inbox in §1.
- `adkim=s; aspf=s` — strict alignment. `fo=1` — forensic detail on any failure.

> Prefer to watch before enforcing? Start with `p=none` for a week, read the
> `rua` reports, then switch to `p=reject`. For a non-sending domain you can
> safely go straight to `p=reject`.

---

## Final record set (what the zone should contain)

| Type | Name | Value | Added by |
|---|---|---|---|
| MX ×3 | `@` | `*.mx.cloudflare.net` (per-zone) | Email Routing (auto) |
| TXT | `@` | `v=spf1 -all` | you (edit) |
| TXT | `*._domainkey` | `v=DKIM1; p=` | you |
| TXT | `_dmarc` | `v=DMARC1; p=reject; rua=mailto:dmarc@lvivsecondhand.com; adkim=s; aspf=s; fo=1` | you |

Verify after ~15 min (DNS propagation):

```
# should list Cloudflare MX hosts
curl -s "https://dns.google/resolve?name=lvivsecondhand.com&type=MX"       | grep -o '"data":"[^"]*"'
curl -s "https://dns.google/resolve?name=lvivsecondhand.com&type=TXT"      | grep -o 'v=spf1[^"]*'
curl -s "https://dns.google/resolve?name=_dmarc.lvivsecondhand.com&type=TXT" | grep -o 'v=DMARC1[^"]*'
```

Or use mxtoolbox.com (`mx:`, `spf:`, `dmarc:` lookups) / Google Admin Toolbox
"Check MX".

---

## 5. Later: sending *as* `@lvivsecondhand.com`

Email Routing can't send outbound. If you want to *reply from*
`hello@lvivsecondhand.com`, you need an SMTP sender, then relax the records for
just that sender:

1. Pick a sender that has a free tier (e.g. a transactional provider, or Gmail
   "Send mail as" via an SMTP relay).
2. **SPF**: add its include before `-all`, e.g.
   `v=spf1 include:<provider-spf> -all`.
3. **DKIM**: publish the provider's selector record (e.g. `s1._domainkey …`).
   Keep the `*._domainkey; p=` wildcard — the specific selector overrides it.
4. Leave **DMARC** at `p=reject`; legitimate mail now passes because it aligns on
   SPF **and** DKIM.

Until then, the §2–§4 records keep the domain unspoofable.

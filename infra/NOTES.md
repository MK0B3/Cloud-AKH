# Infra Notes & Recommendations

Tracked improvements that would harden or speed up the AIKnowledgeHub infra. None are blocking — the pipeline works end-to-end today.

---

## 1. Build speed (`build.sh`)

Current runtime is slow because:

1. **`npm install` runs fresh for every Lambda (4×).** No cache reuse between staging dirs. AWS SDK v3 is heavy (~20–30 MB, thousands of files per install).
2. **PowerShell `Compress-Archive` is used for zipping** (Git Bash doesn't ship `zip` by default). It spins up `powershell.exe` per Lambda and zips via .NET — slow on many small files.
3. **Windows NTFS + MSYS overhead** copying `node_modules` recursively.

### Quick fix — install native `zip`

```bash
pacman -S zip
```

If `pacman` isn't recognized (older Git for Windows without MSYS2), confirm `C:\Program Files\Git\usr\bin\zip.exe` exists and is on PATH. With native `zip`, `build.sh` takes the `zip -rq` branch instead of PowerShell — typically cuts total build time in half.

### Bigger fix — incremental builds

Skip `npm install` when `package.json` hasn't changed since the last build (cache a hash inside `builds/.hashes/<lambda>`). Turns subsequent builds from ~60s into ~10s.

---

## 2. Bedrock throttling resilience

`ai-processor` currently fails a whole SQS batch if Bedrock throttles. Add exponential backoff + jitter around the `ConverseCommand` call, and use partial batch responses (`batchItemFailures`) so only the unprocessed message IDs are retried. Pattern already in place in `email-sender` — mirror it.

---

## 3. DLQ visibility

Dead-letter queues exist for both SQS queues but nothing alerts when messages land there. Minimal ask: a CloudWatch alarm on `ApproximateNumberOfMessagesVisible > 0` on each DLQ, routed to an SNS topic subscribed to your email.

---

## 4. SES production access

Still in sandbox (`eu-west-1`). Can only email verified identities. Two attempted workarounds during the demo prep failed:

- **Auto-verify on subscribe** — wired SES `VerifyEmailIdentity` into the backend `/subscribe` handler, but the EC2 instances in the private subnet timed out reaching `email.eu-west-1.amazonaws.com`. General internet via NAT works (e.g. `google.com` resolves and returns 200), but the SES API endpoint specifically didn't. Suspected NACL or NAT route quirk; reverted the change after the test.
- **Per-recipient verification via console/CLI** — works but doesn't scale and is inconvenient for a live demo.

The clean fix is to request SES production access in the console (≈24h AWS approval), which removes the verified-identity restriction entirely.

---

## 5. Custom domain on CloudFront

Currently the demo URL is the CloudFront-assigned `https://d*.cloudfront.net`. For production, register a domain (Route 53 or external), provision an ACM cert in `us-east-1` (CloudFront requires that region for viewer certs), and add `aliases` + `viewer_certificate.acm_certificate_arn` to `cloudfront.tf`.

---

## 6. Cost hygiene

- **NAT Gateway** is the biggest steady cost (~\$32/mo in `eu-west-1`). Bedrock now reaches the AI processor via interface endpoint (`networking.tf`), so NAT is only needed for outbound traffic from the EC2 ASG (image pulls, OS updates) and one-off SES API calls. Could potentially be dropped if all AWS traffic is routed via VPC endpoints.
- **ALB** adds ~\$16/mo base. Consolidating to a single ALB across multiple apps would amortise that.
- **S3 lifecycle** already expires non-current versions after 30 days.

---

## 7. Observability gaps

- No CloudWatch alarms on Lambda `Errors` or `Duration` p99.
- No structured logging — everything is `console.log` / `console.error`. A small wrapper emitting JSON would make CloudWatch Insights queries far easier.
- No tracing — X-Ray would help understand cross-Lambda + SQS latency.

---

## 8. Tests

No unit/integration tests anywhere in `infra/lambda` or `backend/`. At minimum, a smoke test for the `scraper.service.js` Atom parser would catch arXiv format changes before they hit production.

---

## 9. Container image hygiene

Dockerfiles for `backend/` and `frontend/` are functional but minimal. Consider:

- Multi-stage builds (frontend already does this; backend could too) to drop dev dependencies.
- Pinning base images by digest, not tag, for reproducible builds.
- Adding a `HEALTHCHECK` instruction so EC2 can detect a hung container and restart it before ALB target-group health checks tear the instance down.

---

## 10. Subscription fallback ranking

`subscription-processor` currently ranks fallback papers by `views`, but `views` is never incremented. Effectively arbitrary. Either:

- Prefer papers with `aiSummary` / `audioKey` populated, or
- Increment `views` when an audio link is opened (requires a small redirector Lambda behind CloudFront).

---

## 11. Presigned audio URL lifetime

Audio links expire after 7 days (SigV4 max). If a user opens the email later, links break. Options:

- Add an `/audio/:externalId` redirector Lambda that signs on demand.
- Front the bucket with CloudFront + signed cookies/URLs (longer TTLs possible) — would also let us drop the audio links from being public via presigning entirely.

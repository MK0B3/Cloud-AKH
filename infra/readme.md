# AIKnowledgeHub — AWS Infrastructure

Terraform for the full AIKnowledgeHub stack: a serverless paper-digest pipeline plus a containerised front-end/back-end served over HTTPS.

For the project overview, see the [root README](../README.md). For a step-by-step rebuild from a clean account, see [`REDEPLOY.md`](REDEPLOY.md). For known follow-ups, see [`NOTES.md`](NOTES.md).

---

## Architecture at a glance

```
                     ┌─────────────────────┐
                     │   EventBridge       │   weekly (Mondays 06:00 UTC)
                     └──────────┬──────────┘
                                │
                ┌───────────────┴───────────────┐
                ▼                               ▼
    ┌────────────────────┐         ┌────────────────────────┐
    │ scraper-processor  │         │ subscription-processor │
    │     (Lambda)       │         │       (Lambda)         │
    └────────┬───────────┘         └────────────┬───────────┘
             │                                  │
       arXiv │                                  │ matches
             ▼                                  ▼
    DynamoDB (papers)              SQS aikhub-email-queue
             │                                  │
             ▼                                  ▼
    SQS aikhub-paper-queue         ┌────────────────────┐
             │                     │   email-sender     │
             ▼                     │  (Lambda + SES)    │
    ┌────────────────────┐         └────────────────────┘
    │   ai-processor     │
    │     (Lambda)       │
    └─┬─────────┬────────┘
      │         │
   Bedrock    Polly ──► S3 (audio MP3) ──► DynamoDB updated

User browser
   │ HTTPS
   ▼
CloudFront ──► ALB ──► ASG (EC2 × N) ──► Docker { frontend Nginx, backend Express }
                                                        │
                                                        ▼
                                                 DynamoDB + S3 (presigned)
```

---

## Terraform layout (`infra/*.tf`)

| File              | What it provisions                                                       |
| ----------------- | ------------------------------------------------------------------------ |
| `providers.tf`    | AWS provider + Terraform version pin                                     |
| `variables.tf`    | Inputs (region, project name, SES sender, Bedrock model, EC2 type)       |
| `vpc.tf`          | VPC, public + private subnets across 2 AZs, NAT gateway, route tables    |
| `networking.tf`   | VPC interface endpoints (SQS, SES, Bedrock, ECR), Gateway endpoint (S3, DynamoDB) |
| `dynamodb.tf`     | `aikhub-papers` and `aikhub-subscriptions` tables                        |
| `sqs.tf`          | `aikhub-paper-queue` and `aikhub-email-queue` + DLQs                     |
| `s3.tf`           | Account-portable audio bucket `aikhub-audio-summaries-<account-id>`      |
| `iam.tf`          | Lambda execution role + per-Lambda inline policies                       |
| `lambdas.tf`      | The four Lambda functions, env vars, SQS event-source mappings           |
| `eventbridge.tf`  | Weekly cron schedules for scraper + subscription Lambdas                 |
| `monitoring.tf`   | CloudWatch log groups (14-day retention)                                 |
| `ecr.tf`          | ECR repos for `aikhub-backend` and `aikhub-frontend` images              |
| `ec2.tf`          | EC2 IAM role, security groups, launch template, ALB, target group, ASG  |
| `cloudfront.tf`   | CloudFront distribution fronting the ALB (HTTPS via default cert)        |
| `outputs.tf`      | Useful endpoints (CloudFront URL, ECR URLs, queue URLs, NAT EIP, etc.)   |

---

## Lambda functions (`lambda/`)

All four sit behind the same execution role, packaged by `build.sh` into `infra/builds/`.

### `scraper-processor`
- **Trigger:** EventBridge cron (weekly Mondays 06:00 UTC)
- **Does:** fetches arXiv feeds for NLP / Computer Vision / Reinforcement Learning, writes new papers to DynamoDB with conditional puts (silent dedup on `externalId`), emits one SQS message per topic.

### `ai-processor`
- **Trigger:** SQS `aikhub-paper-queue` (batch size 5)
- **Does:** for each unprocessed paper in the topic — calls Bedrock (Claude Haiku 4.5 via cross-region inference profile) for a 3–4 sentence summary, calls Polly Neural for an MP3, uploads to S3 at `audio/{externalId}.mp3`, updates the DynamoDB item with `aiSummary` + `audioKey`.

### `subscription-processor`
- **Trigger:** EventBridge cron (weekly Mondays 08:00 UTC)
- **Does:** scans subscriptions, matches recent papers per user, trims payload to fit SQS 256 KB limit, pushes to `aikhub-email-queue`, updates `lastEmailSent`.

### `email-sender`
- **Trigger:** SQS `aikhub-email-queue` (batch size 5)
- **Does:** presigns each `audioKey` (7-day TTL), renders HTML + plaintext digest, sends via SES from the verified sender. Reports per-record failures so only failed items retry.

---

## Compute layer (containers)

The serverless pipeline above runs entirely on Lambdas, but the user-facing app runs in containers:

- **Backend** — Express API exposed at `/api/*`, talks to DynamoDB + presigns S3
- **Frontend** — React build served by Nginx, proxies `/api` to the backend

Both images are built locally, pushed to ECR, and pulled by EC2 instances on boot via `user_data`. The ASG runs them inside a private subnet behind an ALB; CloudFront fronts the ALB to provide HTTPS without a custom domain.

---

## Deploy

Prerequisites: `terraform`, `aws` CLI authenticated to the target account, `docker` for image builds.

```bash
# 1. Package the Lambdas
./build.sh

# 2. Provision everything
terraform init
cp terraform.tfvars.example terraform.tfvars   # fill in ses_sender_email
terraform apply

# 3. Build + push the app images (use the ECR URLs from outputs)
ECR=$(terraform output -raw ecr_backend_url)
aws ecr get-login-password --region eu-west-1 | docker login --username AWS --password-stdin "${ECR%/*}"

docker build -t aikhub-backend  ../backend  && docker tag aikhub-backend:latest  $(terraform output -raw ecr_backend_url):latest  && docker push $(terraform output -raw ecr_backend_url):latest
docker build -t aikhub-frontend ../frontend && docker tag aikhub-frontend:latest $(terraform output -raw ecr_frontend_url):latest && docker push $(terraform output -raw ecr_frontend_url):latest

# 4. Force the ASG to pull the new images
aws autoscaling start-instance-refresh --auto-scaling-group-name aikhub-asg \
  --preferences '{"MinHealthyPercentage":50,"InstanceWarmup":120}'

# 5. Open the app
terraform output cloudfront_url
```

---

## Operate

```bash
# Trigger the scraper manually
aws lambda invoke --function-name aikhub-scraper-processor /tmp/out.json && cat /tmp/out.json

# Trigger the email digest manually
aws lambda invoke --function-name aikhub-subscription-processor /tmp/out.json && cat /tmp/out.json

# Tail Lambda logs
aws logs tail /aws/lambda/aikhub-ai-processor --since 10m --format short

# Subscribers vs. SES-verified identities
aws dynamodb scan --table-name aikhub-subscriptions --projection-expression email --query 'Items[].email.S' --output table
aws ses list-identities --identity-type EmailAddress --region eu-west-1 --query Identities --output table
```

---

## Tear down

```bash
# Empty the audio bucket first (versioned objects block destroy)
python empty_bucket.py

terraform destroy
```

NAT gateway + ALB + ASG account for the bulk of idle cost (~$2/day combined), so destroying after a demo is worthwhile.

---

## Notes

- **SES is in sandbox** — only verified email identities can receive digests. Verify each demo recipient in the SES console before sending.
- **Bedrock requires a one-time Anthropic use-case form** per AWS account before any Claude model can be invoked.
- **Region is `eu-west-1`** throughout. The Bedrock model id uses the cross-region inference prefix (`eu.anthropic.claude-haiku-4-5-...`).
- **Account-portable bucket** — the S3 bucket name interpolates the AWS account ID, so the same Terraform applies cleanly across teammate accounts without colliding on the global S3 namespace.

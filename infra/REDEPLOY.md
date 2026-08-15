# Redeploy Guide

How to bring AIKnowledgeHub back up from scratch after a `terraform destroy`. Follow top-to-bottom; each step assumes the previous one finished cleanly.

Estimated total time: **30–45 minutes** (most of which is waiting on CloudFront and the ASG to go healthy).

---

## 0. Prerequisites

You need these installed locally:

| Tool | Why | Check |
|---|---|---|
| AWS CLI v2 | All AWS interaction | `aws --version` |
| Terraform >= 1.5 | Infra provisioning | `terraform version` |
| Docker Desktop | Build backend + frontend images | `docker info` (must show running engine) |
| Node.js 18+ | Lambda `npm install` during `build.sh` | `node --version` |
| Python 3 + boto3 | `empty_bucket.py` on teardown | `python -c "import boto3"` |
| Git Bash / WSL | `build.sh` is bash | `bash --version` |

AWS account access: an IAM user with admin (or at least: VPC, EC2, ECR, ALB, Lambda, SQS, DynamoDB, S3, CloudFront, IAM, SES, EventBridge, Bedrock, CloudWatch Logs).

The account must have **Bedrock model access** enabled for `anthropic.claude-haiku-4-5` in `eu-west-1` (Bedrock Console → Model access → Manage access). Without this, the AI processor Lambda will fail.

---

## 1. Configure your AWS profile

```bash
aws configure --profile teammate     # enter Access Key + Secret + region eu-west-1
export AWS_PROFILE=teammate
aws sts get-caller-identity          # confirm Account == 010396039687
```

If the account number is wrong, **stop**. You'll deploy into the wrong account.

---

## 2. Clone and check out the branch

```bash
git clone https://github.com/<your-org>/AIKnowledgeHub.git
cd AIKnowledgeHub
git checkout main         # or aws-terraform-setup if working off the branch
cd infra
```

---

## 3. Set Terraform variables

Copy the example and edit:

```bash
cp terraform.tfvars.example terraform.tfvars
```

Open `terraform.tfvars` and confirm:

- `aws_region = "eu-west-1"`
- `project_name = "aikhub"` (changing this renames every resource — only change for a parallel deploy)
- `ses_sender_email` = the address you'll send digests **from**. Must be verified in SES (see step 4).
- `bedrock_model_id = "eu.anthropic.claude-haiku-4-5-20251001-v1:0"` (cross-region inference profile for eu-west-1)

---

## 4. Verify the SES sender (and at least one recipient)

SES starts in **sandbox mode**, so both `From:` and `To:` must be verified before any mail goes out.

```bash
aws ses verify-email-identity --email-address SENDER@example.com --region eu-west-1
aws ses verify-email-identity --email-address TEST_RECIPIENT@example.com --region eu-west-1
```

Each address gets an email from `no-reply-aws@amazon.com` — click the link in both. Confirm:

```bash
aws ses list-identities --identity-type EmailAddress --region eu-west-1 \
  --query 'Identities' --output table
```

For production (any-recipient sending), open a Support case to request SES production access. Not needed for demos.

---

## 5. Build the Lambda zip packages

The Terraform `aws_lambda_function` resources point at zips under `infra/builds/`. Build them first:

```bash
cd infra        # if not already there
./build.sh
```

This:
1. Wipes `infra/builds/`
2. For each lambda (`scraper-processor`, `subscription-processor`, `email-sender`, `ai-processor`):
   - Stages a copy
   - Copies in `lambda/shared/` if needed (DynamoDB/SQS helpers)
   - Runs `npm install --omit=dev`
   - Zips it to `infra/builds/<name>.zip`

If `build.sh` fails on `npm install`, check that each lambda's `package.json` has a valid lockfile and run `npm install` manually inside that lambda dir to debug.

---

## 6. Provision infrastructure

```bash
terraform init      # first time only, downloads providers
terraform plan      # review — should show ~60 resources to add
terraform apply     # type 'yes'
```

Apply takes **5–10 min**. Slow resources: NAT gateway (~2 min), CloudFront distribution (~3–5 min), ALB (~30s).

When it finishes, note the outputs (or run `terraform output` again):

- `alb_dns_name` — direct ALB endpoint (HTTP, used by CloudFront origin)
- `cloudfront_url` — public HTTPS URL for the app
- `audio_bucket_name` — S3 bucket for audio summaries
- ECR repository URLs for backend and frontend

**The ASG instances will be unhealthy at this point** — the launch template tries to pull `:latest` images from ECR, but ECR is empty. That's expected. Continue to step 7.

---

## 7. Build and push container images

From the repo root (not `infra/`):

```bash
ACCOUNT_ID=010396039687
REGION=eu-west-1
ECR=$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin $ECR
```

### Backend

```bash
docker build -t aikhub-backend ./backend
docker tag aikhub-backend:latest $ECR/aikhub-backend:latest
docker push $ECR/aikhub-backend:latest
```

### Frontend

```bash
docker build -t aikhub-frontend ./frontend
docker tag aikhub-frontend:latest $ECR/aikhub-frontend:latest
docker push $ECR/aikhub-frontend:latest
```

Each push takes 30s–2min depending on connection.

---

## 8. Refresh the ASG so instances pull the new images

The ASG launched with empty ECR. Force a refresh now that images exist:

```bash
aws autoscaling start-instance-refresh \
  --auto-scaling-group-name aikhub-asg \
  --preferences '{"MinHealthyPercentage":50,"InstanceWarmup":120}'
```

Watch progress:

```bash
aws autoscaling describe-instance-refreshes \
  --auto-scaling-group-name aikhub-asg \
  --query 'InstanceRefreshes[0].[Status,PercentageComplete]' --output text
```

Wait for `Successful 100`. Takes ~5 minutes.

Confirm targets are healthy on the ALB:

```bash
TG_ARN=$(aws elbv2 describe-target-groups --names aikhub-tg --query 'TargetGroups[0].TargetGroupArn' --output text)
aws elbv2 describe-target-health --target-group-arn $TG_ARN \
  --query 'TargetHealthDescriptions[].TargetHealth.State' --output text
```

All states should be `healthy`.

---

## 9. Smoke test the app

Open the CloudFront URL from `terraform output cloudfront_url`. You should see the AIKnowledgeHub UI with the topic dropdown but **no papers yet** — the database is empty.

Test the API directly through CloudFront:

```bash
curl https://<cloudfront-id>.cloudfront.net/api/papers
```

Should return `[]` (empty array, 200 OK).

---

## 10. Populate data: trigger the scraper

Run the scraper once manually to backfill papers (otherwise you wait for the next weekly EventBridge cron):

```bash
aws lambda invoke --function-name aikhub-scraper-processor \
  --cli-binary-format raw-in-base64-out /tmp/scraper.json \
  && cat /tmp/scraper.json
```

The scraper enqueues each fetched paper to SQS → `ai-processor` runs Bedrock summarization + Polly TTS + writes to DynamoDB + uploads MP3 to S3. Takes 2–4 minutes for ~80 papers.

Watch progress:

```bash
aws logs tail /aws/lambda/aikhub-ai-processor --since 5m --format short
```

Confirm papers exist:

```bash
aws dynamodb scan --table-name aikhub-papers --select COUNT --query 'Count'
```

Refresh the CloudFront URL — papers should now appear.

---

## 11. Test the email digest

Subscribe via the UI (use a verified email from step 4), then trigger the digest:

```bash
aws lambda invoke --function-name aikhub-subscription-processor \
  --cli-binary-format raw-in-base64-out /tmp/sub.json \
  && cat /tmp/sub.json
```

Email arrives within ~30s. Check spam if missing.

---

## Common issues

### `terraform apply` fails on Bedrock model access
Open Bedrock Console → Model access → Manage access → enable `anthropic.claude-haiku-4-5`. Re-run `terraform apply`.

### ASG instances never go healthy
- Confirm both ECR repos have a `:latest` tag: `aws ecr list-images --repository-name aikhub-backend`
- SSH via SSM Session Manager into an instance and check `docker ps` and `journalctl -u cloud-final`
- Most common cause: image push wasn't to the **same region** as the ASG. Both must be `eu-west-1`.

### Email never arrives
- Recipient not verified (SES sandbox blocks unverified recipients silently)
- Check `/aws/lambda/aikhub-email-sender` logs

### `terraform destroy` blocks on ECR "not empty"
Already fixed — `force_delete = true` is set on both ECR repos in `ecr.tf`. If it ever reappears: `aws ecr delete-repository --repository-name aikhub-backend --force` (and same for frontend).

### `terraform destroy` blocks on S3 bucket "not empty"
Run `python empty_bucket.py` from `infra/` first. If the bucket name in the script no longer matches (account-suffixed naming), update line 4 to whatever `aws s3api list-buckets --query 'Buckets[?contains(Name,\`aikhub\`)].Name'` returns.

---

## Teardown (to stop billing)

```bash
cd infra
export AWS_PROFILE=teammate
python empty_bucket.py
terraform destroy
```

Verify nothing remains:

```bash
aws ec2 describe-nat-gateways --filter Name=state,Values=available --query 'NatGateways[].NatGatewayId'
aws elbv2 describe-load-balancers --query 'LoadBalancers[].LoadBalancerName'
aws autoscaling describe-auto-scaling-groups --query 'AutoScalingGroups[].AutoScalingGroupName'
```

All three should return `[]`.

---

## What persists across destroy/redeploy

| Item | Survives destroy? | Notes |
|---|---|---|
| Terraform code | Yes (in git) | |
| Lambda source | Yes (in git) | |
| Backend / frontend code | Yes (in git) | |
| `terraform.tfvars` | Yes (local, not in git) | re-create from `.example` if lost |
| `terraform.tfstate` | Yes (local) | keep this file — Terraform's source of truth |
| DynamoDB data | **No** | scraper repopulates on first invoke |
| S3 audio files | **No** | regenerated by ai-processor |
| ECR images | **No** | re-push after `terraform apply` |
| SES verified identities | **Yes** (account-level) | not managed by Terraform |
| CloudFront domain | Changes | new `d*.cloudfront.net` URL each redeploy |

---

## Quick reference: full redeploy from clean account

```bash
# 1. AWS profile + Bedrock model access enabled in console
export AWS_PROFILE=teammate

# 2. Verify SES sender + recipient
aws ses verify-email-identity --email-address SENDER@x.com --region eu-west-1

# 3. Build lambdas + apply infra
cd infra
cp terraform.tfvars.example terraform.tfvars   # edit sender email
./build.sh
terraform init && terraform apply

# 4. Push containers
cd ..
ECR=010396039687.dkr.ecr.eu-west-1.amazonaws.com
aws ecr get-login-password --region eu-west-1 | docker login --username AWS --password-stdin $ECR
docker build -t aikhub-backend ./backend && docker tag aikhub-backend:latest $ECR/aikhub-backend:latest && docker push $ECR/aikhub-backend:latest
docker build -t aikhub-frontend ./frontend && docker tag aikhub-frontend:latest $ECR/aikhub-frontend:latest && docker push $ECR/aikhub-frontend:latest

# 5. Refresh ASG
aws autoscaling start-instance-refresh --auto-scaling-group-name aikhub-asg \
  --preferences '{"MinHealthyPercentage":50,"InstanceWarmup":120}'

# 6. Backfill data
aws lambda invoke --function-name aikhub-scraper-processor \
  --cli-binary-format raw-in-base64-out /tmp/s.json

# 7. Open CloudFront URL from terraform output
terraform -chdir=infra output cloudfront_url
```

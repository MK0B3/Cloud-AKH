"""Post-deploy smoke test for AIKnowledgeHub.

Run after `terraform apply` + container push + ASG refresh to verify the
stack is actually serving traffic before declaring the deploy successful.

Exits non-zero on the first failure so it can gate a CI pipeline.

Usage:
    export AWS_PROFILE=teammate
    python healthcheck.py
    
    --------------------------------------------------------------------
    
    infra/healthcheck.py. It checks:

  1. DynamoDB tables — both papers and subscriptions are ACTIVE
  2. All 4 Lambdas — State=Active and LastUpdateStatus=Successful (catches zips that uploaded but failed to deploy)
  3. ASG — desired instance count are all InService + Healthy
  4. ALB target group — every registered target is healthy

  Exits non-zero on first failure so it can gate a CI pipeline. Run it with:

  export AWS_PROFILE=teammate
  python infra/healthcheck.py
"""

import sys
import boto3
from botocore.exceptions import ClientError

REGION = "eu-west-1"
PROJECT = "aikhub"

ddb = boto3.client("dynamodb", region_name=REGION)
elb = boto3.client("elbv2", region_name=REGION)
lam = boto3.client("lambda", region_name=REGION)
asg = boto3.client("autoscaling", region_name=REGION)

LAMBDAS = [
    f"{PROJECT}-scraper-processor",
    f"{PROJECT}-ai-processor",
    f"{PROJECT}-subscription-processor",
    f"{PROJECT}-email-sender",
]

TABLES = [f"{PROJECT}-papers", f"{PROJECT}-subscriptions"]


def ok(msg):
    print(f"  OK   {msg}")


def fail(msg):
    print(f"  FAIL {msg}")
    sys.exit(1)


def check_dynamodb_tables():
    print("DynamoDB tables")
    for name in TABLES:
        try:
            status = ddb.describe_table(TableName=name)["Table"]["TableStatus"]
        except ClientError as e:
            fail(f"{name}: {e.response['Error']['Code']}")
        if status != "ACTIVE":
            fail(f"{name}: status is {status}")
        ok(f"{name} ACTIVE")


def check_lambdas():
    print("Lambda functions")
    for name in LAMBDAS:
        try:
            cfg = lam.get_function_configuration(FunctionName=name)
        except ClientError as e:
            fail(f"{name}: {e.response['Error']['Code']}")
        state = cfg.get("State")
        last = cfg.get("LastUpdateStatus")
        if state != "Active" or last != "Successful":
            fail(f"{name}: state={state} lastUpdate={last}")
        ok(f"{name} {state}/{last}")


def check_alb_targets():
    print("ALB target health")
    try:
        tgs = elb.describe_target_groups(Names=[f"{PROJECT}-tg"])["TargetGroups"]
    except ClientError as e:
        fail(f"target group lookup: {e.response['Error']['Code']}")
    tg_arn = tgs[0]["TargetGroupArn"]
    targets = elb.describe_target_health(TargetGroupArn=tg_arn)["TargetHealthDescriptions"]
    if not targets:
        fail("no targets registered")
    unhealthy = [(t["Target"]["Id"], t["TargetHealth"]["State"])
                 for t in targets if t["TargetHealth"]["State"] != "healthy"]
    if unhealthy:
        fail(f"unhealthy targets: {unhealthy}")
    ok(f"{len(targets)} target(s) healthy")


def check_asg():
    print("Auto Scaling Group")
    groups = asg.describe_auto_scaling_groups(
        AutoScalingGroupNames=[f"{PROJECT}-asg"]
    )["AutoScalingGroups"]
    if not groups:
        fail("ASG not found")
    g = groups[0]
    desired = g["DesiredCapacity"]
    in_service = sum(
        1 for i in g["Instances"]
        if i["LifecycleState"] == "InService" and i["HealthStatus"] == "Healthy"
    )
    if in_service < desired:
        fail(f"{in_service}/{desired} instances InService+Healthy")
    ok(f"{in_service}/{desired} instances InService+Healthy")


def main():
    print("AIKnowledgeHub healthcheck\n")
    check_dynamodb_tables()
    check_lambdas()
    check_asg()
    check_alb_targets()
    print("\nAll systems go.")


if __name__ == "__main__":
    main()

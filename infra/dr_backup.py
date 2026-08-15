"""Disaster-recovery backup for AIKnowledgeHub state.

Snapshots both DynamoDB tables using the native on-demand backup API
and prunes anything older than RETENTION_DAYS. Backups are stored by
AWS and survive table deletion, so a `terraform destroy` followed by
`terraform apply` can be repopulated by restoring the latest backup.

Run on a schedule (cron / EventBridge) or manually before risky
operations (migrations, schema changes, big terraform applies).

Restore is one CLI call per table:
    aws dynamodb restore-table-from-backup \
        --target-table-name aikhub-papers \
        --backup-arn <ARN-from-list-output>

Usage:
    export AWS_PROFILE=teammate
    python dr_backup.py
"""

import sys
from datetime import datetime, timezone, timedelta
import boto3
from botocore.exceptions import ClientError

REGION = "eu-west-1"
TABLES = ["aikhub-papers", "aikhub-subscriptions"]
RETENTION_DAYS = 7

ddb = boto3.client("dynamodb", region_name=REGION)


def create_backup(table_name):
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    backup_name = f"{table_name}-{stamp}"
    try:
        resp = ddb.create_backup(TableName=table_name, BackupName=backup_name)
    except ClientError as e:
        print(f"  FAIL  {table_name}: {e.response['Error']['Code']}")
        return None
    arn = resp["BackupDetails"]["BackupArn"]
    print(f"  OK    {backup_name}")
    return arn


def prune_old_backups(table_name):
    cutoff = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
    paginator = ddb.get_paginator("list_backups")
    deleted = 0
    for page in paginator.paginate(TableName=table_name):
        for b in page.get("BackupSummaries", []):
            if b["BackupCreationDateTime"] < cutoff:
                ddb.delete_backup(BackupArn=b["BackupArn"])
                deleted += 1
    if deleted:
        print(f"  pruned {deleted} backup(s) older than {RETENTION_DAYS}d for {table_name}")


def main():
    print(f"DR backup ({datetime.now(timezone.utc).isoformat(timespec='seconds')})\n")
    failures = 0
    for t in TABLES:
        if create_backup(t) is None:
            failures += 1
        prune_old_backups(t)
    if failures:
        sys.exit(1)
    print("\nDone.")


if __name__ == "__main__":
    main()

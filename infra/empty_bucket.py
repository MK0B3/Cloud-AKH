"""
 deletes the versioned S3
  audio bucket before terraform destroy (since Terraform can't delete a non-empty versioned bucket)
"""
import boto3

REGION = "eu-west-1"

s3 = boto3.client("s3", region_name=REGION)

# The bucket name is account-suffixed by Terraform, so resolve it from the
# caller's identity rather than hardcoding an account ID.
account_id = boto3.client("sts", region_name=REGION).get_caller_identity()["Account"]
bucket = f"aikhub-audio-summaries-{account_id}"
print(f"Emptying {bucket}")
paginator = s3.get_paginator("list_object_versions")

for page in paginator.paginate(Bucket=bucket):
    objs = [
        {"Key": v["Key"], "VersionId": v["VersionId"]}
        for v in page.get("Versions", []) + page.get("DeleteMarkers", [])
    ]
    if objs:
        s3.delete_objects(Bucket=bucket, Delete={"Objects": objs})
        print(f"Deleted {len(objs)} object versions")

s3.delete_bucket(Bucket=bucket)
print("Bucket deleted")

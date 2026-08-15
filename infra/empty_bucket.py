"""
 deletes the versioned S3
  audio bucket before terraform destroy (since Terraform can't delete a non-empty versioned bucket)
"""
import boto3

s3 = boto3.client("s3", region_name="eu-west-1")
bucket = "aikhub-audio-summaries-010396039687"
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

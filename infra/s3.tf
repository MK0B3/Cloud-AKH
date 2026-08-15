resource "aws_s3_bucket" "audio_bucket" {
  bucket = "${var.project_name}-audio-summaries-${data.aws_caller_identity.current.account_id}"

  tags = var.tags
}

resource "aws_s3_bucket_public_access_block" "audio_bucket_block" {
  bucket = aws_s3_bucket.audio_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "audio_bucket_sse" {
  bucket = aws_s3_bucket.audio_bucket.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "audio_bucket_versioning" {
  bucket = aws_s3_bucket.audio_bucket.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "audio_bucket_lifecycle" {
  bucket = aws_s3_bucket.audio_bucket.id

  rule {
    id     = "expire-old-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

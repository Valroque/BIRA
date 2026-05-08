provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "BIRA"
      ManagedBy = "Terraform"
      Stack     = "bootstrap"
    }
  }
}

data "aws_caller_identity" "current" {}

# Bucket name needs to be globally unique; suffix with the account id so the
# same bootstrap can run in a fresh AWS account without colliding.
locals {
  state_bucket_name = "${var.name_prefix}-tfstate-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket" "state" {
  bucket = local.state_bucket_name

  # State is the source of truth for prod; keep it deletion-protected.
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Account-level public-access block (org-managed) covers this bucket; the
# per-bucket s3:PutBucketPublicAccessBlock call is denied for our SSO role
# by an explicit org policy. We don't re-create the per-bucket setting here.

# State locking uses the S3 backend's native `use_lockfile` (Terraform 1.10+),
# so no DynamoDB table is needed. Lock is a small object inside the same
# state bucket, written via S3 conditional puts.

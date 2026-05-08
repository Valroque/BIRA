# Remote state backend. The bucket is provided via -backend-config on init
# so the same code works against any account, e.g.:
#
#   terraform init \
#     -backend-config="bucket=bira-tfstate-277848662459"
#
# Locking uses the S3 backend's native conditional-write mechanism
# (Terraform 1.10+) — no DynamoDB table needed.
terraform {
  backend "s3" {
    key          = "envs/prod/terraform.tfstate"
    region       = "ap-south-1"
    encrypt      = true
    use_lockfile = true
  }
}

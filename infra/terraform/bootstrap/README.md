# bootstrap

Creates the S3 bucket every other stack uses as its remote-state backend.
Chicken-and-egg: this stack itself uses **local state**. Run it once per
AWS account, then leave it alone.

State locking lives inside the same bucket via the S3 backend's native
`use_lockfile` (Terraform 1.10+). No DynamoDB table involved.

## Apply

```bash
cd infra/terraform/bootstrap
terraform init
terraform apply
```

The bucket name embeds the AWS account id, so the same code works in any
account without collisions. Note the outputs (`state_bucket`, `region`) —
the bucket name goes into every env's `terraform init -backend-config`.

## Local state

This stack's `terraform.tfstate` lives next to the code on whoever ran apply
last. Stash it somewhere durable; without it you can't easily destroy /
modify the bucket later. (The bucket has versioning + encryption on, so
data loss isn't really the risk — but TF can't manage what it doesn't have
state for.)

## Account-level public access block

The state bucket relies on the **account-wide** public-access block enforced
by the org. Our SSO role doesn't have `s3:PutBucketPublicAccessBlock`
(explicit deny in identity-based policy), so the per-bucket resource is
intentionally absent — the org-level setting covers it.

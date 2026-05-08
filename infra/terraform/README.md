# BIRA infra (Terraform)

Terraform code that stands up BIRA's AWS infrastructure. Tracking issue:
[#36](https://github.com/Valroque/BIRA/issues/36).

## Layout

```
infra/terraform/
├── bootstrap/        ← one-time: S3 state bucket (locking is in-bucket via use_lockfile)
├── envs/
│   └── prod/         ← the production environment (the only cloud env)
└── modules/          ← reusable building blocks (vpc, rds, ec2, alb, …)
```

State locking uses the S3 backend's native `use_lockfile` (Terraform 1.10+).
No DynamoDB table involved — concurrent applies are blocked via S3
conditional writes against a small lockfile inside the same state bucket.

**Only one cloud env.** Pre-prod testing happens locally
(`server/docker-compose.yml`, `npm run dev`) and in CI. There is no UAT or
staging tier in AWS — don't add one without explicitly revisiting that
decision.

Decisions locked in issue #36: **EC2 + systemd** for the Node backend,
**ALB serves the FE too** (Express ships `web/dist`), **RDS Postgres 16**.

- **AWS account**: `277848662459` — labelled "Dreamstreet-UAT" in AWS, but
  this **is** BIRA's production account (shared org with a sibling app;
  account name is misleading).
- **Region**: `ap-south-1` (Mumbai)
- **Name prefix**: `bira` (resources read `bira-prod-vpc`, `bira-prod-alb`, …)
- **Domain**: `bira.dreamstreet-uat.tech` — a subdomain in the existing
  public hosted zone `dreamstreet-uat.tech` (zone ID `Z00613191MIVHN1O5S9CD`).
  **TF must not create the zone** — it's shared with the sibling product
  and has 60+ records we don't own. Reference it via:
  ```hcl
  data "aws_route53_zone" "root" {
    name         = "dreamstreet-uat.tech."
    private_zone = false
  }
  ```
  and write `bira.dreamstreet-uat.tech` records into the data-sourced zone.

## First-time setup

### 1. Apply the bootstrap stack (once per AWS account)

The bootstrap stack creates the S3 bucket every other stack uses for remote
state. It uses **local state** itself (chicken-and-egg).

```bash
cd infra/terraform/bootstrap
terraform init
terraform apply
```

Note the outputs — `state_bucket` and `region`. Plug the bucket name into
the env init below.

### 2. Init the prod env against the bootstrapped backend

```bash
cd infra/terraform/envs/prod
terraform init -backend-config="bucket=bira-tfstate-277848662459"
```

### 3. Plan and apply

```bash
terraform plan -var-file=terraform.tfvars
terraform apply -var-file=terraform.tfvars
```

Copy `terraform.tfvars.example` to `terraform.tfvars` first — `.tfvars`
files are gitignored.

## Conventions

- **Naming**: every resource gets `${var.name_prefix}-${var.env}-<thing>` —
  e.g. `bira-prod-vpc`. Resolved as `local.name` inside the env stack.
- **Tags**: provider-level `default_tags` set `Project`, `Env`, `ManagedBy`
  on every resource that supports tagging. Don't re-tag inside modules.
  `Project=BIRA` is what splits BIRA cost out of the shared account.
- **State**: prod writes to `envs/prod/terraform.tfstate` in the bootstrap
  bucket. Concurrent applies are blocked via the S3 backend's `use_lockfile`
  (in-bucket lockfile, no DynamoDB).
- **Modules** live under `modules/` and take `name` (already prefixed),
  `tags`, plus their own knobs. They don't read provider tags or reach back
  into env locals.
- **Validation**: `terraform fmt -recursive` and `terraform validate` are
  the cheap gates. `validate` needs `terraform init -backend=false` first
  in CI / locally without AWS creds.

## Coming next (per issue #36)

- VPC module + env wired (slice 2 — done)
- RDS module (slice 3 — done)
- EC2 ASG + ALB + ACM module (slice 4)
- Secrets / IAM / app config (slice 5)
- Release pipeline (slice 6)

Each lands as a separate PR.

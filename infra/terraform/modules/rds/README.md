# modules/rds

Postgres 16 on RDS, private subnets only, encrypted at rest. Master password
managed by RDS in Secrets Manager (`manage_master_user_password = true`) — the
output `master_user_secret_arn` is what downstream services (EC2, Lambda)
read from.

## Inputs

Required: `name`, `vpc_id`, `subnet_ids` (≥2, in different AZs).

Common knobs: `instance_class`, `multi_az`, `allocated_storage`,
`max_allocated_storage`, `backup_retention_days`, `deletion_protection`,
`skip_final_snapshot`, `allowed_security_group_ids`.

`allowed_security_group_ids` is empty by default — the RDS comes up with no
ingress. When the EC2 module lands, plumb its security group id into this
list (per env).

`parameters` lets you override Postgres params without recreating the
instance — e.g. `[{ name = "log_min_duration_statement", value = "200" }]`.
The custom parameter group is created either way so the hook is always there.

## Outputs

`endpoint`, `address`, `port`, `db_name`, `master_username`,
`master_user_secret_arn`, `security_group_id`, `instance_id`, `instance_arn`.

## Notes

- **Subnet group needs ≥2 AZs** even when `multi_az = false` — that's an
  RDS requirement so you can flip Multi-AZ on later without touching the
  subnet group. The variable validation enforces it.
- **Master password rotation** is not wired in v1. RDS-managed secrets
  support native rotation via `aws_secretsmanager_secret_rotation` — turn
  that on in a later hardening pass.
- **`final_snapshot_identifier`** is fixed to `${name}-postgres-final`
  when `skip_final_snapshot = false`. If you ever destroy + recreate prod,
  that identifier will collide; set it explicitly via tfvars if needed.
- **No KMS CMK in v1.** Encryption uses the default AWS-managed key. Custom
  CMK is a hardening-pass change.

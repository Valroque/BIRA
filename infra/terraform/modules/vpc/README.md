# modules/vpc

Two-tier VPC: public subnets (ALB + NAT) and private subnets (EC2 + RDS),
across N AZs (≥2). One IGW. NAT count toggles via `single_nat_gateway`:
single NAT for dev (cheaper), one-per-AZ for prod (HA).

## Inputs

| name | type | notes |
|---|---|---|
| `name` | string | Already-prefixed, e.g. `bira-dev`. |
| `cidr_block` | string | VPC CIDR, /16 recommended. |
| `azs` | list(string) | ≥2. |
| `public_subnet_cidrs` | list(string) | Same length as `azs`. |
| `private_subnet_cidrs` | list(string) | Same length as `azs`. |
| `single_nat_gateway` | bool | Default `false`. |
| `tags` | map(string) | Merged with provider `default_tags`. |

## Outputs

`vpc_id`, `vpc_cidr_block`, `public_subnet_ids`, `private_subnet_ids`,
`azs`, `nat_gateway_ids`, `internet_gateway_id`.

## Notes

- Subnets keep input ordering. Caller decides which subnet pairs with
  which AZ; downstream modules (RDS subnet group, ALB target group) use
  the lists as-is.
- `enable_dns_hostnames = true` so RDS endpoints resolve from inside.
- No security groups here — they live with the resources they protect
  (ALB SG with the ALB module, EC2 SG with the EC2 module, RDS SG with
  the RDS module). SGs reference each other by ID across modules.

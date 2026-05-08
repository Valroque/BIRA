# modules/alb

Internet-facing Application Load Balancer with:

- HTTP listener on :80 → 301 redirect to HTTPS
- HTTPS listener on :443 with the supplied ACM cert
- Default target group on `target_port` (default 3000) forwarding via HTTP
- Self-owned security group: ingress 80+443 from `0.0.0.0/0`, all egress

The target group has a health check at `health_check_path` (default `/`) —
update to `/api/health` once `server/` exposes it.

## Inputs

Required: `name`, `vpc_id`, `public_subnet_ids` (≥2), `certificate_arn`.

Common knobs: `target_port`, `health_check_path`, `enable_deletion_protection`,
`ssl_policy`, `idle_timeout`, the various `health_check_*` thresholds.

## Outputs

`alb_arn`, `alb_dns_name`, `alb_zone_id` (for Route53 alias),
`https_listener_arn`, `http_listener_arn`, `target_group_arn`, `target_port`,
`security_group_id`.

## Notes

- **Cert region match.** ACM cert must be in the same region as the ALB.
  For us that's `ap-south-1`.
- **`drop_invalid_header_fields = true`** — defends against header smuggling.
- **TLS 1.3 default policy.** `ELBSecurityPolicy-TLS13-1-2-2021-06` allows
  TLS 1.2+ only. Override via `ssl_policy` if you need broader compat.
- **Target group is empty until EC2 lands.** ALB will return 503 for any
  request that hits the listener — that's correct behavior pre-EC2.
- **Deletion protection off by default.** Flip on once the env is steady.

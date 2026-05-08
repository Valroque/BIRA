# modules/acm

DNS-validated ACM cert. Caller supplies the Route53 zone id (typically from
a `data "aws_route53_zone"` lookup) and the FQDN; module writes the
validation records and waits for issuance via
`aws_acm_certificate_validation`.

## Inputs

| name | type | notes |
|---|---|---|
| `domain_name` | string | Primary FQDN, e.g. `bira.dreamstreet-uat.tech`. |
| `subject_alternative_names` | list(string) | Optional. |
| `hosted_zone_id` | string | Where the validation records get written. |
| `validation_record_ttl` | number | Default 60. |
| `tags` | map(string) | Extra tags. |

## Outputs

`certificate_arn` — pulled from the **validation** resource, not the cert
itself, so consumers (`aws_lb_listener.certificate_arn = ...`) implicitly
wait for issuance before applying.

## Notes

- `validation_method = "DNS"` only. Email validation isn't wired.
- `allow_overwrite = true` on validation records, so existing records (e.g.
  from a previous cert apply) don't fail the run.
- For ALB use the cert must live in the **same region** as the ALB. For
  CloudFront it'd need to be `us-east-1` — not relevant here since ALB
  fronts everything.

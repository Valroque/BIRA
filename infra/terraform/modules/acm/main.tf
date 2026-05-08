resource "aws_acm_certificate" "this" {
  domain_name               = var.domain_name
  subject_alternative_names = var.subject_alternative_names
  validation_method         = "DNS"

  tags = merge(var.tags, {
    Name = var.domain_name
  })

  # New cert is issued before old one is destroyed when changing SANs etc.,
  # so the listener can swap without a window of no-cert.
  lifecycle {
    create_before_destroy = true
  }
}

# One DNS record per name on the cert (apex + each SAN). domain_validation_options
# is a set keyed by domain_name; for_each over it keeps the records stable.
resource "aws_route53_record" "validation" {
  for_each = {
    for opt in aws_acm_certificate.this.domain_validation_options :
    opt.domain_name => {
      name   = opt.resource_record_name
      type   = opt.resource_record_type
      record = opt.resource_record_value
    }
  }

  zone_id = var.hosted_zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = var.validation_record_ttl
  records = [each.value.record]

  # Existing validation records (e.g. from a different cert) get overwritten
  # rather than failing the apply.
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "this" {
  certificate_arn         = aws_acm_certificate.this.arn
  validation_record_fqdns = [for r in aws_route53_record.validation : r.fqdn]
}

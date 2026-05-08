output "certificate_arn" {
  description = "ARN of the validated certificate. Reference this from aws_lb_listener.certificate_arn."
  value       = aws_acm_certificate_validation.this.certificate_arn
}

output "domain_name" {
  description = "Primary domain on the cert."
  value       = aws_acm_certificate.this.domain_name
}

output "subject_alternative_names" {
  description = "SANs on the cert."
  value       = aws_acm_certificate.this.subject_alternative_names
}

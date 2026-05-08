variable "domain_name" {
  description = "Primary FQDN to issue the certificate for, e.g. bira.dreamstreet-uat.tech."
  type        = string
}

variable "subject_alternative_names" {
  description = "Additional FQDNs on the cert. Empty by default; add e.g. \"*.bira.dreamstreet-uat.tech\" if a sub-sub need appears."
  type        = list(string)
  default     = []
}

variable "hosted_zone_id" {
  description = "Route53 zone id to write the DNS validation records into. Caller passes this from a data \"aws_route53_zone\" lookup."
  type        = string
}

variable "validation_record_ttl" {
  description = "TTL on the DNS validation records."
  type        = number
  default     = 60
}

variable "tags" {
  description = "Extra tags merged on top of provider default_tags."
  type        = map(string)
  default     = {}
}

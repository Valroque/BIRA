output "account_id" {
  description = "AWS account this env is deployed into."
  value       = data.aws_caller_identity.current.account_id
}

output "region" {
  description = "Region the env runs in."
  value       = var.region
}

output "name_prefix" {
  description = "Resolved name prefix (e.g. bira-prod)."
  value       = local.name
}

output "vpc_id" {
  description = "VPC id."
  value       = module.vpc.vpc_id
}

output "public_subnet_ids" {
  description = "Public subnet ids (ALB, NAT)."
  value       = module.vpc.public_subnet_ids
}

output "private_subnet_ids" {
  description = "Private subnet ids (EC2, RDS)."
  value       = module.vpc.private_subnet_ids
}

output "db_endpoint" {
  description = "RDS endpoint (host:port). Reach via the private subnet only."
  value       = module.rds.endpoint
}

output "db_address" {
  description = "RDS hostname (no port)."
  value       = module.rds.address
}

output "db_name" {
  description = "Initial database name."
  value       = module.rds.db_name
}

output "db_master_user_secret_arn" {
  description = "Secrets Manager ARN holding the master DB credentials."
  value       = module.rds.master_user_secret_arn
}

output "db_security_group_id" {
  description = "DB security group id. Add to allowed_security_group_ids on the app SG once it exists."
  value       = module.rds.security_group_id
}

output "app_url" {
  description = "Public app URL once DNS propagates."
  value       = "https://${aws_route53_record.app.name}"
}

output "app_fqdn" {
  description = "Public FQDN."
  value       = aws_route53_record.app.name
}

output "alb_dns_name" {
  description = "ALB DNS name (the alias target)."
  value       = module.alb.alb_dns_name
}

output "certificate_arn" {
  description = "ACM cert ARN. Already validated when the apply completes."
  value       = module.acm.certificate_arn
}

output "alb_security_group_id" {
  description = "ALB security group id. EC2 SG should accept inbound on the target port from this SG."
  value       = module.alb.security_group_id
}

output "alb_target_group_arn" {
  description = "Default target group ARN. EC2 ASG attaches here."
  value       = module.alb.target_group_arn
}

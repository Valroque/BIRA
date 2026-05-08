output "alb_arn" {
  description = "ALB ARN."
  value       = aws_lb.this.arn
}

output "alb_dns_name" {
  description = "Public DNS name of the ALB. Use as the alias target on the Route53 record."
  value       = aws_lb.this.dns_name
}

output "alb_zone_id" {
  description = "Canonical hosted zone id of the ALB. Required for Route53 alias records."
  value       = aws_lb.this.zone_id
}

output "https_listener_arn" {
  description = "ARN of the :443 listener."
  value       = aws_lb_listener.https.arn
}

output "http_listener_arn" {
  description = "ARN of the :80 → 443 redirect listener."
  value       = aws_lb_listener.http.arn
}

output "target_group_arn" {
  description = "Default target group ARN. Attach EC2 ASG / Auto Scaling targets here."
  value       = aws_lb_target_group.app.arn
}

output "target_port" {
  description = "Port the target group forwards to. App must listen on this port."
  value       = aws_lb_target_group.app.port
}

output "security_group_id" {
  description = "ALB security group id. Reference from the EC2 SG to allow ALB → instance traffic."
  value       = aws_security_group.alb.id
}

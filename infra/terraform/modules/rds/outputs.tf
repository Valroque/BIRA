output "endpoint" {
  description = "DNS endpoint of the primary instance (host:port)."
  value       = aws_db_instance.this.endpoint
}

output "address" {
  description = "DNS address (host only, no port)."
  value       = aws_db_instance.this.address
}

output "port" {
  description = "DB port."
  value       = aws_db_instance.this.port
}

output "db_name" {
  description = "Initial database name."
  value       = aws_db_instance.this.db_name
}

output "master_username" {
  description = "Master DB username."
  value       = aws_db_instance.this.username
}

output "master_user_secret_arn" {
  description = "ARN of the Secrets Manager secret RDS stores the master password in."
  value       = try(aws_db_instance.this.master_user_secret[0].secret_arn, null)
}

output "security_group_id" {
  description = "DB security group id. Pass into other modules as a source for outbound rules pointing at the DB."
  value       = aws_security_group.this.id
}

output "instance_id" {
  description = "RDS instance identifier."
  value       = aws_db_instance.this.id
}

output "instance_arn" {
  description = "RDS instance ARN."
  value       = aws_db_instance.this.arn
}

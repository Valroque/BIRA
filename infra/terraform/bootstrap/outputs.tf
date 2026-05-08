output "state_bucket" {
  description = "S3 bucket holding remote Terraform state. Locking via use_lockfile happens inside the same bucket."
  value       = aws_s3_bucket.state.id
}

output "region" {
  description = "Region the state backend lives in."
  value       = var.region
}

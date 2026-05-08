output "vpc_id" {
  description = "ID of the created VPC."
  value       = aws_vpc.this.id
}

output "vpc_cidr_block" {
  description = "CIDR block of the VPC."
  value       = aws_vpc.this.cidr_block
}

output "public_subnet_ids" {
  description = "Public subnet IDs, in the same order as input azs."
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Private subnet IDs, in the same order as input azs."
  value       = aws_subnet.private[*].id
}

output "azs" {
  description = "AZs used (echoed back for downstream modules)."
  value       = var.azs
}

output "nat_gateway_ids" {
  description = "NAT gateway IDs. Length is 1 if single_nat_gateway else len(azs)."
  value       = aws_nat_gateway.this[*].id
}

output "internet_gateway_id" {
  description = "Internet gateway ID."
  value       = aws_internet_gateway.this.id
}

variable "name" {
  description = "Already-prefixed name for resources, e.g. \"bira-dev\". Module appends suffixes like \"-vpc\", \"-public-a\"."
  type        = string
}

variable "cidr_block" {
  description = "VPC CIDR. /16 recommended so subnet allocation is roomy."
  type        = string
}

variable "azs" {
  description = "List of AZs to span. Length must match public_subnet_cidrs and private_subnet_cidrs."
  type        = list(string)

  validation {
    condition     = length(var.azs) >= 2
    error_message = "At least two AZs are required for ALB/RDS multi-AZ readiness."
  }
}

variable "public_subnet_cidrs" {
  description = "Public subnet CIDRs, one per AZ. Hosts the ALB and NAT gateways."
  type        = list(string)
}

variable "private_subnet_cidrs" {
  description = "Private subnet CIDRs, one per AZ. Hosts EC2 + RDS."
  type        = list(string)
}

variable "single_nat_gateway" {
  description = "If true, route all private subnets through a single NAT in the first AZ (cheaper, dev-only). If false, one NAT per AZ (HA, prod)."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Extra tags merged on top of the provider's default_tags. Module-level Name tag is added automatically per resource."
  type        = map(string)
  default     = {}
}

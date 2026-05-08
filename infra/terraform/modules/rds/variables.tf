variable "name" {
  description = "Already-prefixed name, e.g. \"bira-dev\". Module appends \"-postgres\", \"-db-sg\", etc."
  type        = string
}

variable "vpc_id" {
  description = "VPC the RDS instance lives in (used by the SG)."
  type        = string
}

variable "subnet_ids" {
  description = "Private subnet ids for the DB subnet group. Must span ≥2 AZs even if multi_az is false (RDS requirement)."
  type        = list(string)

  validation {
    condition     = length(var.subnet_ids) >= 2
    error_message = "RDS subnet groups need at least two subnets in different AZs."
  }
}

variable "allowed_security_group_ids" {
  description = "Source security groups allowed to reach Postgres (5432). Empty list = no ingress (default until app SGs exist)."
  type        = list(string)
  default     = []
}

# --- Engine + sizing ---------------------------------------------------------

variable "engine_version" {
  description = "Postgres engine version. Pin to a minor (e.g. 16.3) so applies don't auto-bump."
  type        = string
  default     = "16.3"
}

variable "parameter_group_family" {
  description = "DB parameter group family. Must match the engine major (e.g. postgres16)."
  type        = string
  default     = "postgres16"
}

variable "parameters" {
  description = "Extra DB parameters to set in the custom parameter group. Each entry: { name, value, apply_method? }. apply_method defaults to \"immediate\"."
  type = list(object({
    name         = string
    value        = string
    apply_method = optional(string, "immediate")
  }))
  default = []
}

variable "instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "allocated_storage" {
  description = "Initial storage in GB (gp3)."
  type        = number
  default     = 20
}

variable "max_allocated_storage" {
  description = "Storage autoscaling ceiling in GB. Set ≥ allocated_storage to enable autoscaling."
  type        = number
  default     = 100
}

variable "multi_az" {
  description = "Multi-AZ deployment for HA. Roughly doubles cost; on for prod, off for dev."
  type        = bool
  default     = false
}

# --- DB / credentials --------------------------------------------------------

variable "db_name" {
  description = "Initial database name."
  type        = string
  default     = "bira"
}

variable "master_username" {
  description = "Master DB username. Cannot be \"postgres\" or other reserved names."
  type        = string
  default     = "bira_admin"
}

# --- Backups + safety --------------------------------------------------------

variable "backup_retention_days" {
  description = "Automated backup retention. 7 for dev, 30 for prod (per issue #36)."
  type        = number
  default     = 7
}

variable "backup_window" {
  description = "Daily UTC window for automated backups."
  type        = string
  default     = "20:00-21:00" # ~01:30 IST, off-hours for ap-south-1 users
}

variable "maintenance_window" {
  description = "Weekly UTC window for managed maintenance."
  type        = string
  default     = "Mon:21:30-Mon:22:30"
}

variable "deletion_protection" {
  description = "Block accidental delete via console/CLI. On for prod."
  type        = bool
  default     = false
}

variable "skip_final_snapshot" {
  description = "When true, terraform destroy won't take a final snapshot. Convenient for dev; risky for prod."
  type        = bool
  default     = true
}

variable "apply_immediately" {
  description = "Apply changes outside the maintenance window. Useful for dev iteration; can cause downtime in prod."
  type        = bool
  default     = false
}

variable "performance_insights_enabled" {
  description = "Enable RDS Performance Insights (free tier: 7d retention)."
  type        = bool
  default     = true
}

variable "tags" {
  description = "Extra tags merged on top of provider default_tags."
  type        = map(string)
  default     = {}
}

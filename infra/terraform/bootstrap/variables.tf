variable "region" {
  description = "AWS region for the remote-state backend resources."
  type        = string
  default     = "ap-south-1"
}

variable "name_prefix" {
  description = "Prefix for all resource names. Forms bucket and table names below."
  type        = string
  default     = "bira"
}

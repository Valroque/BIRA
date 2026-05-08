variable "region" {
  description = "AWS region the env runs in."
  type        = string
  default     = "ap-south-1"
}

variable "name_prefix" {
  description = "Prefix for all resource names. Combined with env to form e.g. bira-prod-vpc."
  type        = string
  default     = "bira"
}

variable "env" {
  description = "Environment short name. Mirrors the directory under envs/."
  type        = string
  default     = "prod"
}

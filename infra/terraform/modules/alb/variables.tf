variable "name" {
  description = "Already-prefixed name, e.g. \"bira-prod\". Module appends \"-alb\", \"-tg\", \"-alb-sg\"."
  type        = string
}

variable "vpc_id" {
  description = "VPC the ALB and target group live in."
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnet ids the ALB attaches to. ≥2 in distinct AZs."
  type        = list(string)

  validation {
    condition     = length(var.public_subnet_ids) >= 2
    error_message = "ALBs need at least two public subnets in different AZs."
  }
}

variable "certificate_arn" {
  description = "ACM certificate ARN for the HTTPS listener. Must be in the same region as the ALB."
  type        = string
}

variable "target_port" {
  description = "Port the app listens on inside the EC2 instance. ALB target group forwards 443 → this."
  type        = number
  default     = 3000
}

variable "target_protocol" {
  description = "Protocol between ALB and target."
  type        = string
  default     = "HTTP"
}

variable "health_check_path" {
  description = "Path the target group health-checks. Update to /api/health once the BE exposes it."
  type        = string
  default     = "/"
}

variable "health_check_interval" {
  description = "Seconds between health checks."
  type        = number
  default     = 30
}

variable "health_check_timeout" {
  description = "Seconds before a single health check is considered failed."
  type        = number
  default     = 5
}

variable "health_check_healthy_threshold" {
  description = "Successful checks before marking a target healthy."
  type        = number
  default     = 2
}

variable "health_check_unhealthy_threshold" {
  description = "Failed checks before marking a target unhealthy."
  type        = number
  default     = 3
}

variable "health_check_matcher" {
  description = "HTTP status codes accepted as healthy."
  type        = string
  default     = "200-299"
}

variable "deregistration_delay" {
  description = "Seconds to wait for in-flight requests before deregistering a target. 60 keeps ASG churn snappy; bump for long-running requests."
  type        = number
  default     = 60
}

variable "ssl_policy" {
  description = "ELB SSL policy on the HTTPS listener. Default policy enforces TLS 1.2+."
  type        = string
  default     = "ELBSecurityPolicy-TLS13-1-2-2021-06"
}

variable "enable_deletion_protection" {
  description = "Block accidental delete via console/CLI. Off during early bring-up; flip on for steady-state prod."
  type        = bool
  default     = false
}

variable "idle_timeout" {
  description = "Seconds the ALB holds an idle connection. Default 60."
  type        = number
  default     = 60
}

variable "tags" {
  description = "Extra tags merged on top of provider default_tags."
  type        = map(string)
  default     = {}
}

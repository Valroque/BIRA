provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "BIRA"
      Env       = var.env
      ManagedBy = "Terraform"
    }
  }
}

data "aws_caller_identity" "current" {}

# Existing public hosted zone — shared with the sibling Dreamstreet UAT app.
# We only **add** records (validation + ALB alias) into it; we do NOT manage
# the zone itself. See infra/terraform/README.md for context.
data "aws_route53_zone" "root" {
  name         = "dreamstreet-uat.tech."
  private_zone = false
}

locals {
  name = "${var.name_prefix}-${var.env}"

  azs                  = ["${var.region}a", "${var.region}b"]
  vpc_cidr             = "10.20.0.0/16"
  public_subnet_cidrs  = ["10.20.0.0/24", "10.20.1.0/24"]
  private_subnet_cidrs = ["10.20.10.0/24", "10.20.11.0/24"]

  app_fqdn = "bira.dreamstreet-uat.tech"
}

module "vpc" {
  source = "../../modules/vpc"

  name                 = local.name
  cidr_block           = local.vpc_cidr
  azs                  = local.azs
  public_subnet_cidrs  = local.public_subnet_cidrs
  private_subnet_cidrs = local.private_subnet_cidrs
  single_nat_gateway   = false # prod: NAT per AZ for HA
}

module "rds" {
  source = "../../modules/rds"

  name       = local.name
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnet_ids

  # No app SGs exist yet — wired in when the EC2 module lands.
  allowed_security_group_ids = []

  instance_class        = "db.t4g.small"
  multi_az              = true
  allocated_storage     = 50
  max_allocated_storage = 200

  backup_retention_days = 30
  deletion_protection   = true
  skip_final_snapshot   = false
  apply_immediately     = false
}

module "acm" {
  source = "../../modules/acm"

  domain_name    = local.app_fqdn
  hosted_zone_id = data.aws_route53_zone.root.zone_id
}

module "alb" {
  source = "../../modules/alb"

  name              = local.name
  vpc_id            = module.vpc.vpc_id
  public_subnet_ids = module.vpc.public_subnet_ids
  certificate_arn   = module.acm.certificate_arn

  # Target group is empty until EC2 lands; ALB will 503 in the meantime,
  # which is the expected post-slice-4 state.
  target_port       = 3000
  health_check_path = "/" # bumps to /api/health when the BE exposes it
}

# Public-facing alias: bira.dreamstreet-uat.tech → ALB.
resource "aws_route53_record" "app" {
  zone_id = data.aws_route53_zone.root.zone_id
  name    = local.app_fqdn
  type    = "A"

  alias {
    name                   = module.alb.alb_dns_name
    zone_id                = module.alb.alb_zone_id
    evaluate_target_health = true
  }
}

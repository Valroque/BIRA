resource "aws_db_subnet_group" "this" {
  name       = "${var.name}-db-subnets"
  subnet_ids = var.subnet_ids

  tags = merge(var.tags, {
    Name = "${var.name}-db-subnets"
  })
}

resource "aws_db_parameter_group" "this" {
  name        = "${var.name}-db-params"
  family      = var.parameter_group_family
  description = "Custom Postgres parameter group for ${var.name}."

  dynamic "parameter" {
    for_each = var.parameters
    content {
      name         = parameter.value.name
      value        = parameter.value.value
      apply_method = parameter.value.apply_method
    }
  }

  tags = merge(var.tags, {
    Name = "${var.name}-db-params"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# --- Security group ---------------------------------------------------------

resource "aws_security_group" "this" {
  name        = "${var.name}-db-sg"
  description = "Postgres ingress for ${var.name}"
  vpc_id      = var.vpc_id

  tags = merge(var.tags, {
    Name = "${var.name}-db-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "from_allowed_sgs" {
  for_each = toset(var.allowed_security_group_ids)

  security_group_id            = aws_security_group.this.id
  referenced_security_group_id = each.value
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "Postgres from app SG ${each.value}"
}

# Egress is unrestricted; RDS doesn't initiate outbound traffic anyway, but
# AWS adds a default allow-all egress to every SG and removing it forces a
# weird state. Leave the default in place.

# --- Instance ---------------------------------------------------------------

resource "aws_db_instance" "this" {
  identifier = "${var.name}-postgres"

  engine               = "postgres"
  engine_version       = var.engine_version
  parameter_group_name = aws_db_parameter_group.this.name

  instance_class        = var.instance_class
  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.master_username
  # RDS generates and stores the master password in Secrets Manager and
  # exposes it via the master_user_secret block. Native rotation is opt-in
  # via aws_secretsmanager_secret_rotation later — not wired in v1.
  manage_master_user_password = true

  port                   = 5432
  publicly_accessible    = false
  multi_az               = var.multi_az
  vpc_security_group_ids = [aws_security_group.this.id]
  db_subnet_group_name   = aws_db_subnet_group.this.name

  backup_retention_period = var.backup_retention_days
  backup_window           = var.backup_window
  maintenance_window      = var.maintenance_window
  copy_tags_to_snapshot   = true

  performance_insights_enabled = var.performance_insights_enabled

  auto_minor_version_upgrade  = true
  allow_major_version_upgrade = false

  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${var.name}-postgres-final"

  apply_immediately = var.apply_immediately

  tags = merge(var.tags, {
    Name = "${var.name}-postgres"
  })
}

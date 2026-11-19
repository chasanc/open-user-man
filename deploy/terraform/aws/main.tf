terraform {
  required_version = ">= 1.5"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

provider "aws" {
  region = var.region
}

locals {
  sso = var.oidc_issuer != ""
}

check "signing_key_present" {
  assert {
    condition     = !local.sso || var.oidc_signing_key_json != ""
    error_message = "oidc_signing_key_json is required when oidc_issuer is set."
  }
}

# ---- Secrets -------------------------------------------------------------
# Generated here so they never sit in a file. They do end up in the Terraform
# state, so keep the state in an encrypted bucket you control.

resource "random_password" "db" {
  length  = 32
  special = false # keeps the value safe inside DATABASE_URL
}

resource "random_password" "jwt" {
  length  = 48
  special = false
}

resource "random_password" "totp" {
  length  = 48 # TOTP_ENCRYPTION_KEY needs 32 or more
  special = false
}

resource "random_password" "cookie" {
  length  = 48
  special = false
}

resource "aws_kms_key" "api" {
  description         = "${var.name} secrets"
  enable_key_rotation = true
}

resource "aws_secretsmanager_secret" "api" {
  name                    = "${var.name}/api"
  recovery_window_in_days = 7
  kms_key_id              = aws_kms_key.api.arn
}

resource "aws_secretsmanager_secret_version" "api" {
  secret_id = aws_secretsmanager_secret.api.id
  secret_string = jsonencode(merge(
    {
      DATABASE_URL        = "postgresql://oum:${random_password.db.result}@${aws_db_instance.db.address}:5432/open_user_db"
      JWT_SECRET          = random_password.jwt.result
      TOTP_ENCRYPTION_KEY = random_password.totp.result
    },
    local.sso ? {
      OIDC_COOKIE_KEYS      = random_password.cookie.result
      OIDC_SIGNING_KEY_JSON = var.oidc_signing_key_json
    } : {}
  ))
}

# ---- Network rules -------------------------------------------------------

resource "aws_security_group" "alb" {
  name_prefix = "${var.name}-alb-"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "api" {
  name_prefix = "${var.name}-api-"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 3001
    to_port         = 3001
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "db" {
  name_prefix = "${var.name}-db-"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.api.id]
  }
}

# ---- Database ------------------------------------------------------------

resource "aws_db_subnet_group" "db" {
  name       = "${var.name}-db"
  subnet_ids = var.private_subnet_ids
}

# shortcut: the API's TypeORM setup has no ssl option, so RDS cannot force TLS
# yet. The database is private and only the API task can reach it. Upgrade:
# add an ssl option to the API and set rds.force_ssl back to 1.
resource "aws_db_parameter_group" "db" {
  name   = "${var.name}-pg16"
  family = "postgres16"

  parameter {
    name  = "rds.force_ssl"
    value = "0"
  }
}

resource "aws_db_instance" "db" {
  identifier              = "${var.name}-db"
  engine                  = "postgres"
  engine_version          = "16"
  instance_class          = var.db_instance_class
  allocated_storage       = 20
  storage_encrypted       = true
  db_name                 = "open_user_db"
  username                = "oum"
  password                = random_password.db.result
  db_subnet_group_name    = aws_db_subnet_group.db.name
  parameter_group_name    = aws_db_parameter_group.db.name
  vpc_security_group_ids  = [aws_security_group.db.id]
  publicly_accessible     = false
  backup_retention_period = 7
  deletion_protection     = true
  skip_final_snapshot     = false

  final_snapshot_identifier       = "${var.name}-db-final"
  enabled_cloudwatch_logs_exports = ["postgresql"]
}

# ---- Load balancer -------------------------------------------------------

data "aws_elb_service_account" "this" {}

resource "aws_s3_bucket" "alb_logs" {
  bucket_prefix = "${var.name}-alb-logs-"
}

resource "aws_s3_bucket_public_access_block" "alb_logs" {
  bucket                  = aws_s3_bucket.alb_logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = data.aws_elb_service_account.this.arn }
      Action    = "s3:PutObject"
      Resource  = "${aws_s3_bucket.alb_logs.arn}/*"
    }]
  })
}

resource "aws_lb" "api" {
  name               = "${var.name}-api"
  load_balancer_type = "application"
  subnets            = var.public_subnet_ids
  security_groups    = [aws_security_group.alb.id]

  access_logs {
    bucket  = aws_s3_bucket.alb_logs.id
    enabled = true
  }

  depends_on = [aws_s3_bucket_policy.alb_logs]
}

resource "aws_lb_target_group" "api" {
  name        = "${var.name}-api"
  port        = 3001
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc_id

  health_check {
    path    = "/api/health"
    matcher = "200"
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

# ---- ECS -----------------------------------------------------------------

data "aws_caller_identity" "me" {}

resource "aws_kms_key" "logs" {
  description         = "${var.name} logs"
  enable_key_rotation = true
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.me.account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Effect    = "Allow"
        Principal = { Service = "logs.${var.region}.amazonaws.com" }
        Action    = ["kms:Encrypt*", "kms:Decrypt*", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"]
        Resource  = "*"
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.name}-api"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.logs.arn
}

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${var.name}-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "read_secret" {
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [aws_secretsmanager_secret.api.arn]
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = [aws_kms_key.api.arn]
      }
    ]
  })
}

resource "aws_ecs_cluster" "this" {
  name = var.name
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${var.name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024 # Argon2 uses about 64 MiB per hash
  execution_role_arn       = aws_iam_role.execution.arn

  container_definitions = jsonencode([{
    name         = "api"
    image        = var.api_image
    essential    = true
    portMappings = [{ containerPort = 3001 }]

    environment = [for k, v in merge(
      {
        HTTP_HOST                    = "0.0.0.0"
        HTTP_PORT                    = "3001"
        GRPC_PORT                    = "5581"
        GRPC_TLS                     = "false"
        GRPC_TLS_REQUIRE_CLIENT_CERT = "false"
        DATABASE_KIND                = "postgres"
        JWT_EXPIRES_IN               = "1d"
        COOKIE_SECURE                = "true"
        RATE_LIMIT_ENABLED           = "true"
        RATE_LIMIT_MAX               = "100"
        RATE_LIMIT_WINDOW_SECONDS    = "60"
        LOG_LEVEL                    = "info"
        CORS_ORIGIN                  = var.cors_origin
        MULTI_COMPANY_MODE           = tostring(var.multi_company_mode)
        TRUST_PROXY                  = "1" # one hop: the load balancer
      },
      local.sso ? { OIDC_ISSUER = var.oidc_issuer } : {}
    ) : { name = k, value = v }]

    secrets = [for k in concat(
      ["DATABASE_URL", "JWT_SECRET", "TOTP_ENCRYPTION_KEY"],
      local.sso ? ["OIDC_COOKIE_KEYS", "OIDC_SIGNING_KEY_JSON"] : []
    ) : { name = k, valueFrom = "${aws_secretsmanager_secret.api.arn}:${k}::" }]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.api.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "api"
      }
    }
  }])

  depends_on = [aws_secretsmanager_secret_version.api]
}

resource "aws_ecs_service" "api" {
  name            = "${var.name}-api"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  health_check_grace_period_seconds = 60

  network_configuration {
    subnets         = var.private_subnet_ids
    security_groups = [aws_security_group.api.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 3001
  }

  depends_on = [aws_lb_listener.https]
}

terraform {
  required_providers {
    aws = { source = "hashicorp/aws" }
  }
  required_version = ">= 1.0"
}

provider "aws" {
  region = var.aws_region
}

resource "aws_s3_bucket" "images" {
  bucket = var.s3_bucket_name
  acl    = "private"
  versioning { enabled = true }
}

resource "aws_iam_role" "ec2_role" {
  name = "api-ec2-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

data "aws_iam_policy_document" "ec2_assume" {
  statement { actions = ["sts:AssumeRole"] principals { type = "Service" identifiers = ["ec2.amazonaws.com"] } }
}

resource "aws_iam_role_policy" "ec2_policy" {
  name = "api-ec2-policy"
  role = aws_iam_role.ec2_role.id
  policy = file("${path.module}/iam_policy.json")
}

resource "aws_iam_instance_profile" "ec2_profile" {
  name = "api-ec2-profile"
  role = aws_iam_role.ec2_role.name
}

resource "aws_security_group" "ec2_sg" {
  name        = "api-ec2-sg"
  description = "Allow HTTP and SSH"
  vpc_id      = var.vpc_id
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.admin_cidr]
  }
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress { from_port = 0 to_port = 0 protocol = "-1" cidr_blocks = ["0.0.0.0/0"] }
}

resource "aws_launch_template" "lt" {
  name_prefix   = "api-lt-"
  image_id      = var.ami_id
  instance_type = var.instance_type
  iam_instance_profile { name = aws_iam_instance_profile.ec2_profile.name }
  vpc_security_group_ids = [aws_security_group.ec2_sg.id]
  user_data = file("${path.module}/user_data.sh")
}

resource "aws_autoscaling_group" "asg" {
  name                      = "api-asg"
  max_size                  = var.asg_max
  min_size                  = var.asg_min
  desired_capacity          = var.asg_min
  launch_template { id = aws_launch_template.lt.id, version = "$Latest" }
  vpc_zone_identifier = var.subnet_ids
  target_group_arns = [aws_lb_target_group.api_tg.arn]
  tag {
    key                 = "Name"
    value               = "api-server"
    propagate_at_launch = true
  }
}

resource "aws_cognito_user_pool" "userpool" {
  name = "api-userpool"
  auto_verified_attributes = ["email"]
}

resource "aws_cognito_user_pool_client" "app_client" {
  name         = "api-client"
  user_pool_id = aws_cognito_user_pool.userpool.id
  explicit_auth_flows = ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "api-redis"
  engine               = "redis"
  node_type            = var.cache_node_type
  num_cache_nodes      = 1
  parameter_group_name = "default.redis6.x"
  subnet_group_name    = var.cache_subnet_group
}

resource "aws_dynamodb_table" "images" {
  name           = var.dynamodb_images_table
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "id"
  attribute { name = "id" type = "S" }
  attribute { name = "owner_username" type = "S" }
  attribute { name = "created_at" type = "S" }
  global_secondary_index {
    name               = "owner_username-created_at-index"
    hash_key           = "owner_username"
    range_key          = "created_at"
    projection_type    = "ALL"
  }
}

resource "aws_dynamodb_table" "jobs" {
  name         = var.dynamodb_jobs_table
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"
  attribute { name = "id" type = "S" }
  attribute { name = "owner_username" type = "S" }
  attribute { name = "created_at" type = "S" }
  global_secondary_index {
    name               = "owner_username-created_at-index"
    hash_key           = "owner_username"
    range_key          = "created_at"
    projection_type    = "ALL"
  }
}

resource "aws_ssm_parameter" "dynamo_images" {
  name  = "/api/dynamodb/images_table"
  type  = "String"
  value = aws_dynamodb_table.images.name
}

resource "aws_ssm_parameter" "dynamo_jobs" {
  name  = "/api/dynamodb/jobs_table"
  type  = "String"
  value = aws_dynamodb_table.jobs.name
}

resource "aws_ssm_parameter" "s3_bucket" {
  name  = "/api/s3/bucket"
  type  = "String"
  value = aws_s3_bucket.images.bucket
}

resource "aws_route53_record" "api_record" {
  zone_id = var.hosted_zone_id
  name    = var.domain_name
  type    = "A"
  alias {
    name = aws_lb.api.dns_name
    zone_id = aws_lb.api.zone_id
    evaluate_target_health = true
  }
}

resource "aws_cloudwatch_log_group" "api_logs" {
  name              = "/aws/api"
  retention_in_days = 14
}

# Application Load Balancer
resource "aws_lb" "api" {
  name               = "api-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb_sg.id]
  subnets            = var.subnet_ids
}

resource "aws_security_group" "alb_sg" {
  name   = "api-alb-sg"
  vpc_id = var.vpc_id
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress { from_port = 0 to_port = 0 protocol = "-1" cidr_blocks = ["0.0.0.0/0"] }
}

resource "aws_lb_target_group" "api_tg" {
  name     = "api-tg"
  port     = 8080
  protocol = "HTTP"
  vpc_id   = var.vpc_id
  health_check {
    path                = "/"
    healthy_threshold   = 2
    unhealthy_threshold = 2
    timeout             = 5
    interval            = 30
  }
}

# ACM certificate (DNS validation)
resource "aws_acm_certificate" "cert" {
  domain_name = var.domain_name
  validation_method = "DNS"
}

resource "aws_route53_record" "cert_validation" {
  name    = aws_acm_certificate.cert.domain_validation_options[0].resource_record_name
  type    = aws_acm_certificate.cert.domain_validation_options[0].resource_record_type
  zone_id = var.hosted_zone_id
  records = [aws_acm_certificate.cert.domain_validation_options[0].resource_record_value]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "cert_val" {
  certificate_arn = aws_acm_certificate.cert.arn
  validation_record_fqdns = [aws_route53_record.cert_validation.fqdn]
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-2016-08"
  certificate_arn   = aws_acm_certificate.cert.arn
  default_action {
    type = "forward"
    target_group_arn = aws_lb_target_group.api_tg.arn
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type = "redirect"
    redirect {
      port = "443"
      protocol = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

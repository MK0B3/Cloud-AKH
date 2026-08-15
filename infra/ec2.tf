data "aws_caller_identity" "current" {}

data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
}

# ─── EC2 Instance Role ───

resource "aws_iam_role" "ec2_instance" {
  name = "${var.project_name}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "ec2_ecr_pull" {
  role       = aws_iam_role.ec2_instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

resource "aws_iam_role_policy_attachment" "ec2_ssm" {
  role       = aws_iam_role.ec2_instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "ec2_app" {
  name = "${var.project_name}-ec2-app-policy"
  role = aws_iam_role.ec2_instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoDBAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.papers.arn,
          "${aws_dynamodb_table.papers.arn}/index/*",
          aws_dynamodb_table.subscriptions.arn
        ]
      },
      {
        Sid      = "S3AudioAccess"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.audio_bucket.arn}/*"
      }
    ]
  })
}

resource "aws_iam_instance_profile" "ec2_instance" {
  name = "${var.project_name}-ec2-profile"
  role = aws_iam_role.ec2_instance.name
}

# ─── Security Groups ───

resource "aws_security_group" "alb" {
  name        = "${var.project_name}-alb-sg"
  description = "Public-facing ALB"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTP from anywhere"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS from anywhere"
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

  tags = merge(var.tags, { Name = "${var.project_name}-alb-sg" })
}

resource "aws_security_group" "ec2" {
  name        = "${var.project_name}-ec2-sg"
  description = "App servers - accept only ALB traffic"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Frontend Nginx from ALB"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, { Name = "${var.project_name}-ec2-sg" })
}

# ─── Launch Template ───

locals {
  ecr_uri = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"

  user_data = <<-EOT
    #!/bin/bash
    set -e

    REGION="${var.aws_region}"
    ECR_URI="${local.ecr_uri}"
    BACKEND_IMAGE="$${ECR_URI}/${aws_ecr_repository.backend.name}:latest"
    FRONTEND_IMAGE="$${ECR_URI}/${aws_ecr_repository.frontend.name}:latest"

    dnf update -y
    dnf install -y docker
    systemctl enable --now docker

    aws ecr get-login-password --region $${REGION} \
      | docker login --username AWS --password-stdin $${ECR_URI}

    docker pull $${BACKEND_IMAGE}
    docker pull $${FRONTEND_IMAGE}

    docker network create aikhub-net || true

    docker run -d \
      --name backend \
      --network aikhub-net \
      --restart unless-stopped \
      -e PORT=3000 \
      -e AWS_REGION=$${REGION} \
      -e PAPERS_TABLE=${aws_dynamodb_table.papers.name} \
      -e SUBSCRIPTIONS_TABLE=${aws_dynamodb_table.subscriptions.name} \
      -e S3_BUCKET=${aws_s3_bucket.audio_bucket.id} \
      $${BACKEND_IMAGE}

    docker run -d \
      --name frontend \
      --network aikhub-net \
      --restart unless-stopped \
      -p 80:80 \
      -e BACKEND_HOST=backend \
      $${FRONTEND_IMAGE}
  EOT
}

resource "aws_launch_template" "app" {
  name_prefix   = "${var.project_name}-app-"
  image_id      = data.aws_ami.amazon_linux_2023.id
  instance_type = var.ec2_instance_type

  iam_instance_profile {
    name = aws_iam_instance_profile.ec2_instance.name
  }

  network_interfaces {
    associate_public_ip_address = false
    security_groups             = [aws_security_group.ec2.id]
  }

  user_data = base64encode(local.user_data)

  tag_specifications {
    resource_type = "instance"
    tags          = merge(var.tags, { Name = "${var.project_name}-app" })
  }

  lifecycle {
    create_before_destroy = true
  }
}

# ─── Target Group + ALB + Listener ───

resource "aws_lb_target_group" "app" {
  name        = "${var.project_name}-app-tg"
  port        = 80
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "instance"

  health_check {
    path                = "/api/health"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = var.tags
}

resource "aws_lb" "app" {
  name               = "${var.project_name}-alb"
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  tags = var.tags
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.app.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

# ─── Auto Scaling Group ───

resource "aws_autoscaling_group" "app" {
  name                      = "${var.project_name}-asg"
  vpc_zone_identifier       = aws_subnet.private[*].id
  target_group_arns         = [aws_lb_target_group.app.arn]
  health_check_type         = "ELB"
  health_check_grace_period = 180

  min_size         = 1
  max_size         = 4
  desired_capacity = 2

  launch_template {
    id      = aws_launch_template.app.id
    version = "$Latest"
  }

  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 50
    }
  }

  tag {
    key                 = "Name"
    value               = "${var.project_name}-app"
    propagate_at_launch = true
  }
}

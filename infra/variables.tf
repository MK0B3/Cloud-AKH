variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "eu-west-1"
}

variable "project_name" {
  description = "Project prefix used in resource names"
  type        = string
  default     = "aikhub"
}

variable "ses_sender_email" {
  description = "Verified SES sender email"
  type        = string
}

variable "bedrock_model_id" {
  description = "Bedrock model used for paper summaries"
  type        = string
  default     = "eu.anthropic.claude-haiku-4-5-20251001-v1:0"
}

variable "ec2_instance_type" {
  description = "EC2 instance type for the application servers"
  type        = string
  default     = "t3.micro"
}

variable "tags" {
  description = "Common tags applied to resources"
  type        = map(string)
  default = {
    Project = "AIKnowledgeHub"
  }
}

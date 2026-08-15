resource "aws_cloudwatch_log_group" "scraper_processor" {
  name              = "/aws/lambda/${var.project_name}-scraper-processor"
  retention_in_days = 14
  tags              = var.tags
}

resource "aws_cloudwatch_log_group" "subscription_processor" {
  name              = "/aws/lambda/${var.project_name}-subscription-processor"
  retention_in_days = 14
  tags              = var.tags
}

resource "aws_cloudwatch_log_group" "email_sender" {
  name              = "/aws/lambda/${var.project_name}-email-sender"
  retention_in_days = 14
  tags              = var.tags
}

resource "aws_cloudwatch_log_group" "ai_processor" {
  name              = "/aws/lambda/${var.project_name}-ai-processor"
  retention_in_days = 14
  tags              = var.tags
}

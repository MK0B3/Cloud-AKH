output "scraper_lambda_name" {
  value = aws_lambda_function.scraper_processor.function_name
}

output "subscription_lambda_name" {
  value = aws_lambda_function.subscription_processor.function_name
}

output "email_sender_lambda_name" {
  value = aws_lambda_function.email_sender.function_name
}

output "ai_processor_lambda_name" {
  value = aws_lambda_function.ai_processor.function_name
}

output "paper_queue_url" {
  value = aws_sqs_queue.paper_queue.id
}

output "email_queue_url" {
  value = aws_sqs_queue.email_queue.id
}

output "s3_bucket_name" {
  value = aws_s3_bucket.audio_bucket.id
}

output "nat_gateway_eip" {
  description = "Public IP of NAT gateway (for external service whitelisting)"
  value       = aws_eip.nat.public_ip
}

output "papers_table_name" {
  value = aws_dynamodb_table.papers.name
}

output "subscriptions_table_name" {
  value = aws_dynamodb_table.subscriptions.name
}

output "alb_dns_name" {
  description = "Public DNS for the ALB — open in browser to reach the app"
  value       = aws_lb.app.dns_name
}

output "ecr_backend_url" {
  description = "Push backend image here"
  value       = aws_ecr_repository.backend.repository_url
}

output "ecr_frontend_url" {
  description = "Push frontend image here"
  value       = aws_ecr_repository.frontend.repository_url
}

output "cloudfront_url" {
  description = "HTTPS URL — use this for the demo"
  value       = "https://${aws_cloudfront_distribution.app.domain_name}"
}

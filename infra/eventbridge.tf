# ─── Daily Scraper Trigger ───

resource "aws_cloudwatch_event_rule" "daily_scrape" {
  name                = "${var.project_name}-daily-scrape"
  description         = "Triggers scraper Lambda daily"
  schedule_expression = "cron(0 2 * * ? *)"

  tags = var.tags
}

resource "aws_cloudwatch_event_target" "daily_scrape_target" {
  rule      = aws_cloudwatch_event_rule.daily_scrape.name
  target_id = "ScraperLambda"
  arn       = aws_lambda_function.scraper_processor.arn
}

resource "aws_lambda_permission" "allow_eventbridge_scrape" {
  statement_id  = "AllowEventBridgeScrape"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.scraper_processor.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.daily_scrape.arn
}

# ─── Daily Email Trigger ───

resource "aws_cloudwatch_event_rule" "weekly_email" {
  name                = "${var.project_name}-weekly-email"
  description         = "Triggers subscription processor weekly (every Monday)"
  schedule_expression = "cron(0 8 ? * MON *)"

  tags = var.tags
}

resource "aws_cloudwatch_event_target" "weekly_email_target" {
  rule      = aws_cloudwatch_event_rule.weekly_email.name
  target_id = "SubscriptionProcessorLambda"
  arn       = aws_lambda_function.subscription_processor.arn
}

resource "aws_lambda_permission" "allow_eventbridge_email" {
  statement_id  = "AllowEventBridgeEmail"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.subscription_processor.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.weekly_email.arn
}
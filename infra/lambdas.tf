# ─── Scraper Lambda ───

resource "aws_lambda_function" "scraper_processor" {
  function_name = "${var.project_name}-scraper-processor"
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  role          = aws_iam_role.lambda_exec.arn

  filename         = "${path.module}/builds/scraper-processor.zip"
  source_code_hash = filebase64sha256("${path.module}/builds/scraper-processor.zip")

  timeout     = 120
  memory_size = 256

  environment {
    variables = {
      PAPERS_TABLE    = aws_dynamodb_table.papers.name
      PAPER_QUEUE_URL = aws_sqs_queue.paper_queue.id
    }
  }

  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }

  depends_on = [aws_cloudwatch_log_group.scraper_processor]
}

# ─── Subscription Processor Lambda ───

resource "aws_lambda_function" "subscription_processor" {
  function_name = "${var.project_name}-subscription-processor"
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  role          = aws_iam_role.lambda_exec.arn

  filename         = "${path.module}/builds/subscription-processor.zip"
  source_code_hash = filebase64sha256("${path.module}/builds/subscription-processor.zip")

  timeout     = 120
  memory_size = 256

  environment {
    variables = {
      PAPERS_TABLE        = aws_dynamodb_table.papers.name
      SUBSCRIPTIONS_TABLE = aws_dynamodb_table.subscriptions.name
      EMAIL_QUEUE_URL     = aws_sqs_queue.email_queue.id
    }
  }

  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }

  depends_on = [aws_cloudwatch_log_group.subscription_processor]
}

# ─── Email Sender Lambda ───

resource "aws_lambda_function" "email_sender" {
  function_name = "${var.project_name}-email-sender"
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  role          = aws_iam_role.lambda_exec.arn

  filename         = "${path.module}/builds/email-sender.zip"
  source_code_hash = filebase64sha256("${path.module}/builds/email-sender.zip")

  timeout     = 30
  memory_size = 128

  environment {
    variables = {
      SES_SENDER_EMAIL = var.ses_sender_email
      S3_BUCKET        = aws_s3_bucket.audio_bucket.id
    }
  }

  depends_on = [aws_cloudwatch_log_group.email_sender]
}

# ─── AI Processor Lambda ───

resource "aws_lambda_function" "ai_processor" {
  function_name = "${var.project_name}-ai-processor"
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  role          = aws_iam_role.lambda_exec.arn

  filename         = "${path.module}/builds/ai-processor.zip"
  source_code_hash = filebase64sha256("${path.module}/builds/ai-processor.zip")

  timeout     = 300
  memory_size = 512

  environment {
    variables = {
      PAPERS_TABLE     = aws_dynamodb_table.papers.name
      S3_BUCKET        = aws_s3_bucket.audio_bucket.id
      BEDROCK_MODEL_ID = var.bedrock_model_id
    }
  }

  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }

  depends_on = [aws_cloudwatch_log_group.ai_processor]
}

# ─── SQS Triggers ───

resource "aws_lambda_event_source_mapping" "paper_queue_trigger" {
  event_source_arn = aws_sqs_queue.paper_queue.arn
  function_name    = aws_lambda_function.ai_processor.arn
  batch_size       = 5
  enabled          = true
}

resource "aws_lambda_event_source_mapping" "email_queue_trigger" {
  event_source_arn = aws_sqs_queue.email_queue.arn
  function_name    = aws_lambda_function.email_sender.arn
  batch_size       = 5
  enabled          = true
}

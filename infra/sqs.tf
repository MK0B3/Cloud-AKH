# ─── Dead Letter Queues ───

resource "aws_sqs_queue" "paper_dlq" {
  name                      = "${var.project_name}-paper-dlq"
  message_retention_seconds = 1209600
  tags = var.tags
}

resource "aws_sqs_queue" "email_dlq" {
  name                      = "${var.project_name}-email-dlq"
  message_retention_seconds = 1209600
  tags = var.tags
}

# ─── Main Queues ───

resource "aws_sqs_queue" "paper_queue" {
  name                       = "${var.project_name}-paper-processing"
  visibility_timeout_seconds = 300
  receive_wait_time_seconds  = 10

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.paper_dlq.arn
    maxReceiveCount     = 3
  })

  tags = var.tags
}

resource "aws_sqs_queue" "email_queue" {
  name                       = "${var.project_name}-email-queue"
  visibility_timeout_seconds = 60

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.email_dlq.arn
    maxReceiveCount     = 3
  })

  tags = var.tags
}

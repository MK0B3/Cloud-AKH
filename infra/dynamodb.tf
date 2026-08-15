resource "aws_dynamodb_table" "papers" {
  name         = "${var.project_name}-papers"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "externalId"

  attribute {
    name = "externalId"
    type = "S"
  }

  attribute {
    name = "topic"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  global_secondary_index {
    name            = "topic-createdAt-index"
    hash_key        = "topic"
    range_key       = "createdAt"
    projection_type = "ALL"
  }

  tags = var.tags
}

resource "aws_dynamodb_table" "subscriptions" {
  name         = "${var.project_name}-subscriptions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "email"

  attribute {
    name = "email"
    type = "S"
  }

  tags = var.tags
}

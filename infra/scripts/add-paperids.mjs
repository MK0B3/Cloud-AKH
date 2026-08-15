import { randomUUID } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "eu-west-1" }));
let updated = 0, ExclusiveStartKey;

do {
  const res = await ddb.send(new ScanCommand({
    TableName: "aikhub-papers",
    FilterExpression: "attribute_not_exists(paperID_UUID)",
    ProjectionExpression: "externalId",
    ExclusiveStartKey,
  }));
  for (const item of res.Items ?? []) {
    await ddb.send(new UpdateCommand({
      TableName: "aikhub-papers",
      Key: { externalId: item.externalId },
      UpdateExpression: "SET paperID_UUID = :id",
      ExpressionAttributeValues: { ":id": randomUUID() },
    }));
    updated++;
  }
  ExclusiveStartKey = res.LastEvaluatedKey;
} while (ExclusiveStartKey);

console.log(`Added paperID_UUID to ${updated} papers`);

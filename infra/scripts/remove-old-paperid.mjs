import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "eu-west-1" }));
let cleaned = 0, ExclusiveStartKey;

do {
  const res = await ddb.send(new ScanCommand({
    TableName: "aikhub-papers",
    FilterExpression: "attribute_exists(paperId)",
    ProjectionExpression: "externalId",
    ExclusiveStartKey,
  }));
  for (const item of res.Items ?? []) {
    await ddb.send(new UpdateCommand({
      TableName: "aikhub-papers",
      Key: { externalId: item.externalId },
      UpdateExpression: "REMOVE paperId",
    }));
    cleaned++;
  }
  ExclusiveStartKey = res.LastEvaluatedKey;
} while (ExclusiveStartKey);

console.log(`Removed old paperId from ${cleaned} papers`);

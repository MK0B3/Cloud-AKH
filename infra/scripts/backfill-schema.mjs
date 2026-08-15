import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "eu-west-1" }));

const PAPERS_TABLE = "aikhub-papers";
const SUBSCRIPTIONS_TABLE = "aikhub-subscriptions";

const audioUrlToKey = (audioUrl) => {
  try {
    const u = new URL(audioUrl);
    return decodeURIComponent(u.pathname.replace(/^\//, ""));
  } catch {
    return null;
  }
};

const backfillPapers = async () => {
  let migrated = 0, ExclusiveStartKey;
  do {
    const res = await ddb.send(new ScanCommand({
      TableName: PAPERS_TABLE,
      FilterExpression: "attribute_exists(audioUrl) AND attribute_not_exists(audioKey)",
      ProjectionExpression: "externalId, audioUrl",
      ExclusiveStartKey,
    }));
    for (const item of res.Items ?? []) {
      const key = audioUrlToKey(item.audioUrl);
      if (!key) continue;
      await ddb.send(new UpdateCommand({
        TableName: PAPERS_TABLE,
        Key: { externalId: item.externalId },
        UpdateExpression: "SET audioKey = :k REMOVE audioUrl",
        ExpressionAttributeValues: { ":k": key },
      }));
      migrated++;
    }
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  console.log(`papers: migrated audioUrl -> audioKey on ${migrated} items`);
};

const backfillSubscriptions = async () => {
  let migrated = 0, ExclusiveStartKey;
  do {
    const res = await ddb.send(new ScanCommand({
      TableName: SUBSCRIPTIONS_TABLE,
      FilterExpression: "attribute_exists(subscribedTopics) AND attribute_not_exists(topics)",
      ExclusiveStartKey,
    }));
    for (const item of res.Items ?? []) {
      await ddb.send(new UpdateCommand({
        TableName: SUBSCRIPTIONS_TABLE,
        Key: { email: item.email },
        UpdateExpression: "SET topics = :t REMOVE subscribedTopics",
        ExpressionAttributeValues: { ":t": item.subscribedTopics },
      }));
      migrated++;
    }
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  console.log(`subscriptions: migrated subscribedTopics -> topics on ${migrated} items`);
};

await backfillPapers();
await backfillSubscriptions();

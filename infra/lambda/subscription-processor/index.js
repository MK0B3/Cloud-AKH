import {
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb } from "./shared/dynamo.js";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const sqs = new SQSClient({});

const queryPapersForTopic = async (topic, since) => {
  const params = {
    TableName: process.env.PAPERS_TABLE,
    IndexName: "topic-createdAt-index",
    KeyConditionExpression: since
      ? "#t = :t AND createdAt > :d"
      : "#t = :t",
    ExpressionAttributeNames: { "#t": "topic" },
    ExpressionAttributeValues: since
      ? { ":t": topic, ":d": since }
      : { ":t": topic },
    ScanIndexForward: false,
  };

  const response = await ddb.send(new QueryCommand(params));
  return response.Items ?? [];
};

const getPapersForUser = async (user) => {
  const topics = user.topics || [];
  const since = user.lastEmailSent || null;

  const perTopic = await Promise.all(
    topics.map((t) => queryPapersForTopic(t, since))
  );

  let papers = perTopic.flat();

  if (!papers.length && topics.length) {
    const fallback = await Promise.all(
      topics.map((t) => queryPapersForTopic(t, null))
    );
    papers = fallback
      .flat()
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .slice(0, 5);
  }

  return papers;
};

export const handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  try {
    const scan = await ddb.send(
      new ScanCommand({ TableName: process.env.SUBSCRIPTIONS_TABLE })
    );
    const users = scan.Items ?? [];

    const MAX_PAPERS_PER_EMAIL = 5;

    for (const user of users) {
      const papers = await getPapersForUser(user);

      if (!papers.length) continue;

      const slim = papers.slice(0, MAX_PAPERS_PER_EMAIL).map((p) => ({
        externalId: p.externalId,
        title: p.title,
        topic: p.topic,
        summary: (p.plainLanguageSummary || p.summary || "").slice(0, 500), // prefers plainLanguageSummary (LLM-generated), falls back to original arXiv abstract
        pdfUrl: p.pdfUrl,
        audioKey: p.audioKey,
      }));

      await sqs.send(
        new SendMessageCommand({
          QueueUrl: process.env.EMAIL_QUEUE_URL,
          MessageBody: JSON.stringify({
            email: user.email,
            topics: user.topics,
            papers: slim,
          }),
        })
      );

      await ddb.send(
        new UpdateCommand({
          TableName: process.env.SUBSCRIPTIONS_TABLE,
          Key: { email: user.email },
          UpdateExpression: "SET lastEmailSent = :t, createdAt = if_not_exists(createdAt, :t)",
          ExpressionAttributeValues: { ":t": new Date().toISOString() },
        })
      );
    }

    return {
      statusCode: 200,
      body: { success: true },
    };
  } catch (error) {
    console.error(error);
    throw error;
  }
};

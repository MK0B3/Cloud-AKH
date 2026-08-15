// backend/database/papers.repo.js
import dynamo from "./dynamodb.js";
import s3client from "./s3.js";
import { ScanCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { PAPERS_TABLE, S3_BUCKET } from "../config/env.js"; // S3_BUCKET now from central config
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const fetchPapers = async ({ topics = [], limit = 10 }) => {
  const safeLimit = Number(limit) || 10;

  // Build a server-side filter if topics are provided, so we don't
  // pull every item and filter in memory
  const scanParams = {
    TableName: PAPERS_TABLE,
  };

  if (topics.length > 0) {
    // DynamoDB filter expression — filters on the server before returning items
    const topicConditions = topics.map((_, i) => `contains(topics, :topic${i})`);
    scanParams.FilterExpression = topicConditions.join(" OR ");
    scanParams.ExpressionAttributeValues = topics.reduce((acc, topic, i) => {
      acc[`:topic${i}`] = topic;
      return acc;
    }, {});
  }

  const result = await dynamo.send(new ScanCommand(scanParams));

  let papers = result.Items || [];

  papers.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  return papers.slice(0, safeLimit);
};

export const fetchPaperById = async (externalId) => {
  const result = await dynamo.send(
    new GetCommand({
      TableName: PAPERS_TABLE,
      Key: { externalId },
    })
  );

  const paper = result.Item;

  if (!paper) return null;

  if (!paper.audioKey) return paper;

  // Generate a signed URL — expires in 1 hour
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET, // now uses central config, not process.env directly
    Key: paper.audioKey,
  });

  const audioUrl = await getSignedUrl(s3client, command, { expiresIn: 3600 });

  return { ...paper, audioUrl };
};
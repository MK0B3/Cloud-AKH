import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const REGION = process.env.AWS_REGION || "eu-west-1";
const PAPERS_TABLE = process.env.PAPERS_TABLE || "aikhub-papers";
const S3_BUCKET = process.env.S3_BUCKET || "aikhub-audio-summaries";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434/api/generate";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3";
const TOPIC_FILTER = process.env.TOPIC || null;
const MAX_PAPERS = Number(process.env.MAX_PAPERS || 5);

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true, convertEmptyValues: false },
});
const polly = new PollyClient({ region: REGION });
const s3 = new S3Client({ region: REGION });

const generateAISummary = async (paper) => {
  const prompt = `Summarize this AI paper in 3-4 simple sentences:

Title: ${paper.title}
Topic: ${paper.topic}
Abstract: ${paper.summary}`;

  const res = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.5, num_predict: 300 },
    }),
  });

  if (!res.ok) {
    throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return (data.response || "").trim();
};

const generateAudio = async (text) => {
  const response = await polly.send(
    new SynthesizeSpeechCommand({
      Text: text,
      OutputFormat: "mp3",
      VoiceId: "Joanna",
      Engine: "neural",
    })
  );
  const chunks = [];
  for await (const chunk of response.AudioStream) chunks.push(chunk);
  return Buffer.concat(chunks);
};

const uploadToS3 = async (buffer, externalId) => {
  const safeId = externalId.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `audio/${safeId}.mp3`;
  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: "audio/mpeg",
    })
  );
  return `https://${S3_BUCKET}.s3.amazonaws.com/${key}`;
};

const findUnprocessed = async () => {
  const items = [];
  let ExclusiveStartKey;
  do {
    const params = {
      TableName: PAPERS_TABLE,
      FilterExpression: "attribute_not_exists(audioUrl)",
      ExclusiveStartKey,
    };
    if (TOPIC_FILTER) {
      params.FilterExpression += " AND #t = :t";
      params.ExpressionAttributeNames = { "#t": "topic" };
      params.ExpressionAttributeValues = { ":t": TOPIC_FILTER };
    }
    const res = await ddb.send(new ScanCommand(params));
    items.push(...(res.Items ?? []));
    ExclusiveStartKey = res.LastEvaluatedKey;
    if (items.length >= MAX_PAPERS) break;
  } while (ExclusiveStartKey);
  return items.slice(0, MAX_PAPERS);
};

const main = async () => {
  console.log(`[local-ai] region=${REGION} table=${PAPERS_TABLE} model=${OLLAMA_MODEL} topic=${TOPIC_FILTER ?? "any"} max=${MAX_PAPERS}`);
  const papers = await findUnprocessed();
  console.log(`[local-ai] found ${papers.length} unprocessed paper(s)`);

  let ok = 0;
  for (const paper of papers) {
    try {
      console.log(`\n[local-ai] → ${paper.externalId} :: ${paper.title?.slice(0, 80)}`);
      const plainLanguageSummary = await generateAISummary(paper);
      console.log(`[local-ai]   summary (${plainLanguageSummary.length} chars)`);
      const audio = await generateAudio(plainLanguageSummary);
      console.log(`[local-ai]   audio ${audio.length} bytes`);
      const audioUrl = await uploadToS3(audio, paper.externalId);
      await ddb.send(
        new UpdateCommand({
          TableName: PAPERS_TABLE,
          Key: { externalId: paper.externalId },
          UpdateExpression: "SET plainLanguageSummary = :s, audioUrl = :u",
          ExpressionAttributeValues: { ":s": plainLanguageSummary, ":u": audioUrl },
        })
      );
      console.log(`[local-ai]   updated → ${audioUrl}`);
      ok++;
    } catch (err) {
      console.error(`[local-ai]   FAILED ${paper.externalId}: ${err.message}`);
    }
  }
  console.log(`\n[local-ai] done: ${ok}/${papers.length} processed`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

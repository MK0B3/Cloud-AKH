import { runScraper } from "./services/scraper.service.js";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const sqs = new SQSClient({});

export const handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  try {
    const results = await runScraper();

    const queueUrl = process.env.PAPER_QUEUE_URL;

    if (queueUrl) {
      for (const result of results) {
        if (result.inserted > 0) {
          await sqs.send(
            new SendMessageCommand({
              QueueUrl: queueUrl,
              MessageBody: JSON.stringify({
                action: "process_new_papers",
                topic: result.topic,
                category: result.category,
                insertedCount: result.inserted,
              }),
            })
          );
        }
      }
    }

    console.log("Scraper results:", JSON.stringify(results));

    return {
      statusCode: 200,
      body: { success: true, results },
    };
  } catch (error) {
    console.error("Scraper Lambda error:", error);
    throw error;
  }
};

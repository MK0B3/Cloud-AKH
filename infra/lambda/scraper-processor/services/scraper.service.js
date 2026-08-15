import { randomUUID } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../shared/dynamo.js";

const CATEGORY_MAP = {
  "cs.CL": "NLP",
  "cs.CV": "Computer Vision",
  "cs.LG": "Reinforcement Learning",
};

const MAX_RESULTS = 10;

const parser = new XMLParser({ ignoreAttributes: false });

export const runScraper = async () => {
  const results = [];

  for (const [arxivCategory, topicName] of Object.entries(CATEGORY_MAP)) {
    const url = `https://export.arxiv.org/api/query?search_query=cat:${arxivCategory}&sortBy=submittedDate&sortOrder=descending&max_results=${MAX_RESULTS}`;

    const response = await fetch(url);
    const xmlText = await response.text();
    const parsed = parser.parse(xmlText);

    const entries = [].concat(parsed?.feed?.entry ?? []);

    const papers = entries.map((entry) => {
      const fullId = entry.id ?? "";
      const externalId = fullId.split("/abs/")[1] ?? fullId;

      const links = [].concat(entry.link ?? []);
      const pdfLink = links.find((l) => l["@_type"] === "application/pdf");
      const pdfUrl = pdfLink ? pdfLink["@_href"] : null;

      return {
        paperID_UUID: randomUUID(),
        externalId,
        title: entry.title?.trim(),
        topic: topicName,
        topics: [topicName],
        summary: entry.summary?.trim(), // original arXiv abstract — technical, academic language
        pdfUrl,
        source: "arXiv",
        publishedAt: entry.published
          ? new Date(entry.published).toISOString()
          : null,
        createdAt: new Date().toISOString(),
      };
    });

    let inserted = 0;
    for (const paper of papers) {
      try {
        await ddb.send(
          new PutCommand({
            TableName: process.env.PAPERS_TABLE,
            Item: paper,
            ConditionExpression: "attribute_not_exists(externalId)",
          })
        );
        inserted++;
      } catch (err) {
        if (err.name !== "ConditionalCheckFailedException") {
          throw err;
        }
      }
    }

    results.push({
      category: arxivCategory,
      topic: topicName,
      fetched: papers.length,
      inserted,
      skipped: papers.length - inserted,
    });
  }

  return results;
};

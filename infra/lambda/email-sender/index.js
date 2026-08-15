import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ses = new SESClient({});
const s3 = new S3Client({});

const AUDIO_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

const presignAudio = async (audioKey) => {
  if (!audioKey) return null;
  try {
    return await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: audioKey }),
      { expiresIn: AUDIO_URL_TTL_SECONDS }
    );
  } catch (err) {
    console.error(`presign failed for ${audioKey}: ${err.message}`);
    return null;
  }
};

export const handler = async (event) => {
  const results = [];

  const topicList = (p) =>
    (Array.isArray(p.topics) ? p.topics : [p.topic]).filter(Boolean).join(", ");

  for (const record of event.Records) {
    const { email, papers, topics } = JSON.parse(record.body);

    try {
      const papersWithAudio = await Promise.all(
        papers.map(async (p) => ({ ...p, signedAudioUrl: await presignAudio(p.audioKey) }))
      );

      const paperList = papersWithAudio
        .map(
          (p, i) =>
            `${i + 1}. ${p.title}\n` +
            `   Topics: ${topicList(p)}\n` +
            `   ${p.summary.slice(0, 200)}...\n` +
            `   PDF: ${p.pdfUrl || "Not available"}\n` +
            (p.signedAudioUrl ? `   Audio: ${p.signedAudioUrl}\n` : "")
        )
        .join("\n");

      const textBody =
        `Hi there!\n\nHere are the latest AI research papers matching your topics ` +
        `(${topics.join(", ")}):\n\n${paperList}\n---\nAIKnowledgeHub`;

      const htmlBody =
        `<h2>Your AI Research Update</h2>` +
        `<p>Topics: <strong>${topics.join(", ")}</strong></p><hr/>` +
        papersWithAudio
          .map(
            (p) =>
              `<div style="margin-bottom:20px;">` +
              `<h3>${p.title}</h3>` +
              `<p><em>${topicList(p)}</em></p>` +
              `<p>${p.summary.slice(0, 300)}...</p>` +
              (p.pdfUrl ? `<a href="${p.pdfUrl}">Read PDF</a>` : "") +
              (p.signedAudioUrl ? ` &middot; <a href="${p.signedAudioUrl}">Listen (audio)</a>` : "") +
              `</div>`
          )
          .join("") +
        `<hr/><p style="color:#888;">AIKnowledgeHub &middot; audio links expire in 7 days</p>`;

      await ses.send(
        new SendEmailCommand({
          Source: process.env.SES_SENDER_EMAIL,
          Destination: { ToAddresses: [email] },
          Message: {
            Subject: {
              Data: `AIKnowledgeHub: ${papers.length} new papers in ${topics.join(", ")}`,
              Charset: "UTF-8",
            },
            Body: {
              Text: { Data: textBody, Charset: "UTF-8" },
              Html: { Data: htmlBody, Charset: "UTF-8" },
            },
          },
        })
      );

      results.push({ email, status: "sent" });
    } catch (error) {
      console.error(`Failed ${email}:`, error.message);
      results.push({ email, status: "failed" });
    }
  }

  return {
    batchItemFailures: event.Records
      .filter((_, i) => results[i]?.status === "failed")
      .map((r) => ({ itemIdentifier: r.messageId })),
  };
};

// Minimal stand-in for the Express backend so the frontend can run without AWS.
// Serves the same response shapes as backend/controllers/*.js.
//
// Sample data, not a live feed. The papers and their arXiv ids are real, but
// `publishedAt` is synthetic — set to the last couple of weeks so the homepage
// demonstrates what a recent scrape looks like. The summaries stand in for what
// Bedrock generates in the deployed pipeline.
import { createServer } from "node:http";

const PORT = 3001;

const PAPERS = [
  {
    externalId: "2304.02643",
    title: "Segment Anything",
    topics: ["Computer Vision"],
    source: "arXiv",
    publishedAt: "2026-08-14T09:12:00.000Z",
    pdfUrl: "https://arxiv.org/pdf/2304.02643",
    audioKey: "audio/2304.02643.mp3",
    plainLanguageSummary:
      "This work introduces a segmentation model that can isolate any object in an image from a simple prompt such as a point or a box, without being retrained for each new task. The authors built it alongside the largest segmentation dataset released to date, containing over a billion masks across eleven million images. The resulting model transfers to unfamiliar objects and domains without fine-tuning, matching or beating specialised systems in many cases.",
  },
  {
    externalId: "2112.10752",
    title: "High-Resolution Image Synthesis with Latent Diffusion Models",
    topics: ["Computer Vision"],
    source: "arXiv",
    publishedAt: "2026-08-11T08:30:00.000Z",
    pdfUrl: "https://arxiv.org/pdf/2112.10752",
    audioKey: "audio/2112.10752.mp3",
    plainLanguageSummary:
      "Diffusion models produce excellent images but are expensive to train and sample because they operate directly on pixels. This paper moves the diffusion process into a compressed latent space learned by an autoencoder, cutting compute requirements dramatically while preserving detail. The approach also makes it straightforward to condition generation on text or layout, and it underpins several widely used open image generators.",
  },
  {
    externalId: "2010.11929",
    title:
      "An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale",
    topics: ["Computer Vision"],
    source: "arXiv",
    publishedAt: "2026-08-06T13:48:00.000Z",
    pdfUrl: "https://arxiv.org/pdf/2010.11929",
    audioKey: "audio/2010.11929.mp3",
    plainLanguageSummary:
      "The authors show that a standard Transformer, applied directly to sequences of image patches, can match or exceed convolutional networks on image classification. Convolutions had been assumed necessary for vision, but this work finds that with enough pretraining data the inductive bias they provide is not required. The result opened the door to treating images and text with a single shared architecture.",
  },
  {
    externalId: "2005.11401",
    title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
    topics: ["NLP"],
    source: "arXiv",
    publishedAt: "2026-08-13T16:40:00.000Z",
    pdfUrl: "https://arxiv.org/pdf/2005.11401",
    audioKey: "audio/2005.11401.mp3",
    plainLanguageSummary:
      "Large language models store facts in their weights, which makes updating or citing that knowledge difficult. This paper pairs a generator with a retriever that pulls relevant passages from an external corpus at inference time, so the model can ground its answers in documents it can point to. The combination improves accuracy on open-domain question answering and lets the knowledge source be swapped without retraining.",
  },
  {
    externalId: "1810.04805",
    title:
      "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
    topics: ["NLP"],
    source: "arXiv",
    publishedAt: "2026-08-10T14:22:00.000Z",
    pdfUrl: "https://arxiv.org/pdf/1810.04805",
    audioKey: "audio/1810.04805.mp3",
    plainLanguageSummary:
      "BERT pretrains a Transformer to fill in masked words using context from both directions at once, rather than reading strictly left to right. This bidirectional objective produces representations that transfer well, so a single pretrained model can be fine-tuned for question answering, inference, or classification with minimal task-specific architecture. It set new state-of-the-art results across eleven language understanding benchmarks.",
  },
  {
    externalId: "1706.03762",
    title: "Attention Is All You Need",
    topics: ["NLP"],
    source: "arXiv",
    publishedAt: "2026-08-05T09:03:00.000Z",
    pdfUrl: "https://arxiv.org/pdf/1706.03762",
    audioKey: "audio/1706.03762.mp3",
    plainLanguageSummary:
      "This paper proposes the Transformer, a sequence model built purely from attention mechanisms with no recurrence or convolution. Removing sequential dependencies allows training to be parallelised across positions, cutting training time substantially while improving translation quality. The architecture became the foundation for essentially all subsequent large language models.",
  },
  {
    externalId: "1801.01290",
    title:
      "Soft Actor-Critic: Off-Policy Maximum Entropy Deep Reinforcement Learning with a Stochastic Actor",
    topics: ["Reinforcement Learning"],
    source: "arXiv",
    publishedAt: "2026-08-12T11:05:00.000Z",
    pdfUrl: "https://arxiv.org/pdf/1801.01290",
    audioKey: "audio/1801.01290.mp3",
    plainLanguageSummary:
      "Reinforcement learning agents are often unstable to train and need enormous numbers of environment interactions. Soft Actor-Critic adds an entropy term to the objective, rewarding the agent for keeping its behaviour varied rather than collapsing early onto one strategy. This makes learning notably more stable and sample-efficient across continuous control tasks, with less sensitivity to hyperparameter choices.",
  },
  {
    externalId: "1710.02298",
    title: "Rainbow: Combining Improvements in Deep Reinforcement Learning",
    topics: ["Reinforcement Learning"],
    source: "arXiv",
    publishedAt: "2026-08-07T10:15:00.000Z",
    pdfUrl: "https://arxiv.org/pdf/1710.02298",
    audioKey: "audio/1710.02298.mp3",
    plainLanguageSummary:
      "Many independent refinements to deep Q-learning had been published, but it was unclear whether they addressed overlapping problems or complementary ones. This paper integrates six of them into a single agent and ablates each in turn to measure its individual contribution. The combined system substantially outperforms any single improvement on the Atari benchmark, showing the gains genuinely compose.",
  },
  {
    externalId: "1707.06347",
    title: "Proximal Policy Optimization Algorithms",
    topics: ["Reinforcement Learning"],
    source: "arXiv",
    publishedAt: "2026-08-04T15:27:00.000Z",
    pdfUrl: "https://arxiv.org/pdf/1707.06347",
    audioKey: "audio/1707.06347.mp3",
    plainLanguageSummary:
      "Policy gradient methods can collapse when a single update shifts the policy too far. PPO constrains each update with a clipped objective that is far simpler to implement than earlier trust-region approaches while retaining their reliability. Its combination of stability and simplicity made it a default choice for continuous control and, later, for reinforcement learning from human feedback.",
  },
];

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname.replace(/\/$/, "") || "/";

  if (req.method === "OPTIONS") return json(res, 204, {});

  if (req.method === "GET" && path === "/papers") {
    const topicParam = url.searchParams.get("topic");
    const limit = Number(url.searchParams.get("limit")) || 10;
    const topics = topicParam ? topicParam.split(",").map((t) => t.trim()) : [];

    const filtered = topics.length
      ? PAPERS.filter((p) => p.topics.some((t) => topics.includes(t)))
      : PAPERS;

    const data = filtered
      .slice()
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
      .slice(0, limit);

    return json(res, 200, { success: true, count: data.length, data });
  }

  const audio = path.match(/^\/audio\/(.+)\.wav$/);
  if (req.method === "GET" && audio) {
    // Stand-in for the Polly MP3 in S3 — 3s of silence, just enough for the
    // <audio> element to render with working controls.
    const rate = 8000;
    const samples = rate * 3;
    const buf = Buffer.alloc(44 + samples);
    buf.write("RIFF", 0);
    buf.writeUInt32LE(36 + samples, 4);
    buf.write("WAVEfmt ", 8);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(rate, 24);
    buf.writeUInt32LE(rate, 28);
    buf.writeUInt16LE(1, 32);
    buf.writeUInt16LE(8, 34);
    buf.write("data", 36);
    buf.writeUInt32LE(samples, 40);
    buf.fill(128, 44);
    res.writeHead(200, {
      "Content-Type": "audio/wav",
      "Access-Control-Allow-Origin": "*",
      "Content-Length": buf.length,
    });
    return res.end(buf);
  }

  const detail = path.match(/^\/papers\/(.+)$/);
  if (req.method === "GET" && detail) {
    const paper = PAPERS.find((p) => p.externalId === decodeURIComponent(detail[1]));
    if (!paper) return json(res, 404, { success: false, error: "Paper not found" });
    // The real backend swaps audioKey for a presigned S3 URL here.
    const { audioKey, ...rest } = paper;
    const audioUrl = `http://localhost:${PORT}/audio/${paper.externalId}.wav`;
    return json(res, 200, { success: true, data: { ...rest, audioUrl } });
  }

  if (req.method === "POST" && path === "/subscriptions") {
    return json(res, 201, {
      success: true,
      message: "Subscription created successfully",
    });
  }

  if (req.method === "GET" && path === "/health") {
    return json(res, 200, { status: "ok" });
  }

  json(res, 404, { success: false, error: "Not found" });
}).listen(PORT, () => console.log(`mock api on http://localhost:${PORT}`));

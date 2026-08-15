// backend/app.js
import express from "express";
import { PORT } from "./config/env.js";
import paperRouter from "./routes/paper.routes.js";
import subscriptionRouter from "./routes/subscription.routes.js";
import errorMiddleware from "./middleware/error.middleware.js";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Health check — must be BEFORE other routes and does NO database work
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/papers", paperRouter);
app.use("/subscriptions", subscriptionRouter);

app.use(errorMiddleware);

const server = app.listen(PORT, () => {
  console.log(`AIKnowledgeHub API is running on port ${PORT}`);
});

// Graceful shutdown — lets in-flight requests finish before the container stops
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
});
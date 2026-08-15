import { createSubscription } from "../database/subscriptions.repo.js";

export const subscribeUser = async (req, res, next) => {
  try {
    const {email, subscribedTopics} = req.body;

    if (!email || !subscribedTopics?.length) {
      const error = new Error("Email and at least one topic are required");
      error.statusCode = 400;
      throw error;
    }

    const newUser = await createSubscription({
      email: email.trim().toLowerCase(),
      topics: subscribedTopics
    });

    res.status(201).json({
      success: true,
      message: "Subscription created successfully",
      subscription: newUser
    });
  } catch (error) {
    next(error);
  }
};
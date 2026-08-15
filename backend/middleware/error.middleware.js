const errorMiddleware = (err, req, res, next) => {
  console.error(err);

  // DynamoDB duplicate subscription
  if (err.name === "ConditionalCheckFailedException") {
    return res.status(400).json({
      success: false,
      error: "This email is already subscribed.",
    });
  }

  res.status(err.statusCode || 500).json({
    success: false,
    error: err.message || "Server Error",
  });
};

export default errorMiddleware;
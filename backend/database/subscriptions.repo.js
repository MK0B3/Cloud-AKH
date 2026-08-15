import dynamo from "./dynamodb.js";
import {PutCommand} from "@aws-sdk/lib-dynamodb";
import {SUBSCRIPTIONS_TABLE} from "../config/env.js";

export const createSubscription = async ({ email, topics }) => {
  const item = {
    email,
    topics,
    createdAt: new Date().toISOString(),
    lastEmailSent: null,
  };

  await dynamo.send(
    new PutCommand({
      TableName: SUBSCRIPTIONS_TABLE,
      Item: item,
      ConditionExpression: "attribute_not_exists(email)",
    })
  );

  return item;
};
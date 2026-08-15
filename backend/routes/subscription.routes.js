import {Router} from "express";
import {subscribeUser} from "../controllers/subscription.controller.js";

const subscriptionRouter = Router();

subscriptionRouter.post("/", subscribeUser);

export default subscriptionRouter;
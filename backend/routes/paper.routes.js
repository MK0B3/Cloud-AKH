import {Router} from "express";
import {getPapers, getPaper} from "../controllers/paper.controller.js";

const paperRouter = Router();

paperRouter.get("/", getPapers);
paperRouter.get("/:id", getPaper);

export default paperRouter;
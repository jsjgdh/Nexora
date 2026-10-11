import { createService, start } from "@nexora/service-kit";
import { registerCurriculumRoutes } from "./routes.js";
import { getVersion } from "./content.js";

const port = Number(process.env.PORT ?? "8102");

const app = await createService("curriculum");
registerCurriculumRoutes(app);
app.log.info(getVersion(), "curriculum loaded");

await start(app, port);

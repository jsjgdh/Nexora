import { createService, start } from "@nexora/service-kit";
import { registerCurriculumRoutes } from "./routes.js";
import { getIdeVersion } from "./ide.js";

const port = Number(process.env.PORT ?? "8102");

const app = await createService("curriculum");
registerCurriculumRoutes(app);
// Importing ./ide.js already validated the snapshot (it throws at load on a
// malformed one); logging the shape makes a bad sync visible at boot.
app.log.info(getIdeVersion(), "ide curriculum loaded");

await start(app, port);

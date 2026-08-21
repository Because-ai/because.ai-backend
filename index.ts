import { env } from "./src/config/env";
import { app } from "./src/app";

app.listen(env.PORT, () => {
  console.log(`because.ai-backend listening on :${env.PORT}`);
});

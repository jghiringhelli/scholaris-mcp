import express from "express";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { dispatch } from "../../src/tools/scholaris-router.js";
import type { Request, Response } from "express";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: "20mb" }));
app.use(express.static(join(__dirname, "public")));

app.post("/api/dispatch", async (req: Request, res: Response) => {
  try {
    const result = await dispatch(req.body);
    res.json({ ok: true, result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ ok: false, error: message });
  }
});

const PORT = Number(process.env.PORT ?? 3000);

// Loopback only: the server has no authentication.
app.listen(PORT, "127.0.0.1", () => {
  console.log(`Scholaris Web -> http://localhost:${PORT} (local only)`);
});

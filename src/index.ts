import { Hono } from "hono";
import { logger } from "hono/logger";
import { env } from "./env";
import { webhook } from "./line/webhook";
import { products } from "./routes/products";
import { settings } from "./routes/settings";
import { ordersPublic } from "./routes/orders";
import { promotions } from "./routes/promotions";

const app = new Hono();

app.use("*", logger());
app.get("/api/health", (c) => c.json({ ok: true, time: new Date().toISOString() }));
app.route("/api/line", webhook);
app.route("/api/products", products);
app.route("/api/settings", settings);
app.route("/api/orders", ordersPublic);
app.route("/api/promotions", promotions);

export default {
  port: env.PORT,
  fetch: app.fetch,
};

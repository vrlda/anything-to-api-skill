import express from "express";
import type { Express } from "express";

export function createDemoServer(): Express {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  const customers = Array.from({ length: 7 }, (_, index) => ({ id: `cus_${index + 1}`, name: `Customer ${index + 1}` }));

  app.get("/", (_request, response) => response.type("html").send(`<!doctype html><html><body>
    <button id="login">Login demo</button><button id="customers">Load customers</button><pre id="output"></pre>
    <script>
      login.onclick = async () => { output.textContent = await (await fetch('/login', { method: 'POST' })).text(); };
      customers.onclick = async () => { output.textContent = await (await fetch('/api/customers?page=1')).text(); };
    </script></body></html>`));

  app.post("/login", (_request, response) => response.cookie("demo_session", "valid", { httpOnly: true }).json({ csrf: "demo-csrf" }));
  app.use("/api", (request, response, next) => request.headers.cookie?.includes("demo_session=valid") ? next() : response.status(401).json({ error: "login_required" }));
  app.get("/api/customers", (request, response) => {
    const page = Number(request.query.page ?? 1);
    const search = String(request.query.search ?? "").toLowerCase();
    const filtered = customers.filter((customer) => customer.name.toLowerCase().includes(search));
    const items = filtered.slice((page - 1) * 3, page * 3);
    response.json({ items, next: page * 3 < filtered.length ? page + 1 : null });
  });
  app.post("/api/customers", (request, response) => {
    if (request.headers["x-csrf-token"] !== "demo-csrf") return response.status(403).json({ error: "csrf" });
    const customer = { id: `cus_${customers.length + 1}`, name: request.body.name };
    customers.push(customer);
    response.status(201).json(customer);
  });
  app.get("/api/invoices/:id", (request, response) => response.json({ id: request.params.id, total: 4200, currency: "USD" }));
  app.get("/api/invoices/:id/download", (request, response) => response.type("application/pdf").send(Buffer.from(`demo invoice ${request.params.id}`)));
  return app;
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 4317);
  createDemoServer().listen(port, () => console.log(`Demo site: http://localhost:${port}`));
}

import { pool } from "../config/db.ts";
import { importCustomers } from "./importCustomers.ts";
import { importProducts } from "./importProducts.ts";
import { importOrderItems } from "./importOrderItems.ts";
import { importOrders } from "./importOrders.ts";

const client = await pool.connect();

try {
  await client.query("BEGIN");

  await client.query(
    `
    TRUNCATE TABLE 
    order_items, orders, products, customers
    RESTART IDENTITY;
    `,
  );

  await importCustomers(client);
  await importProducts(client);
  await importOrders(client);
  await importOrderItems(client);

  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  console.error("La ingesta de datos ha fallado. Se ha realizado ROLLBACK.");
  throw error;
} finally {
  await client.release();
  await pool.end();
}

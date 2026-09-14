import fs from "node:fs";
import path from "node:path";
import { from as copyFrom } from "pg-copy-streams";
import type { PoolClient } from "pg";

const filePath = path.resolve(process.cwd(), "app/dataset/orders.csv");

export async function importOrders(client: PoolClient): Promise<void> {
  try {
    await client.query(
      `
      CREATE TEMP TABLE staging_orders (
        order_ref TEXT,
        customer_email TEXT,
        status TEXT,
        created_at TIMESTAMPTZ
      ) ON COMMIT DROP;
      `,
    );

    const copyStream = await client.query(
      copyFrom(
        `
        COPY staging_orders (order_ref, customer_email, status, created_at) FROM STDIN
        WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');
        `,
      ),
    );

    await new Promise<void>((resolve, reject) => {
      const fileStream = fs.createReadStream(filePath);

      fileStream.on("error", reject);
      copyStream.on("error", reject);
      copyStream.on("finish", resolve);

      fileStream.pipe(copyStream);
    });

    await client.query(
      `
      INSERT INTO orders (order_ref, customer_email, status, created_at)
      SELECT order_ref, customer_email, status, created_at
      FROM staging_orders
      `,
    );

    console.log(
      "Los registros del archivo orders.csv han sido importados exitosamente",
    );
  } catch (error) {
    console.error("No se pudo realizar la importación de orders.csv");
    throw error;
  }
}

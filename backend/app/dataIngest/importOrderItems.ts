import fs from "node:fs";
import path from "node:path";
import { from as copyFrom } from "pg-copy-streams";
import type { PoolClient } from "pg";

const filePath = path.resolve(process.cwd(), "app/dataset/order_items.csv");

export async function importOrderItems(client: PoolClient): Promise<void> {
  try {
    await client.query(
      `
      CREATE TEMP TABLE staging_order_items (
        order_ref TEXT,
        sku TEXT,
        quantity INT,
        unit_price NUMERIC(10, 2)
      ) ON COMMIT DROP;
      `,
    );

    const copyStream = await client.query(
      copyFrom(
        `
        COPY staging_order_items (order_ref, sku, quantity, unit_price) FROM STDIN
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
      INSERT INTO order_items (order_ref, sku, quantity, unit_price)
      SELECT order_ref, sku, quantity, unit_price
      FROM staging_order_items
      `,
    );

    console.log(
      "Los registros del archivo order_items.csv han sido importados exitosamente",
    );
  } catch (error) {
    console.error("No se pudo realizar la importación de order_items.csv");
    throw error;
  }
}

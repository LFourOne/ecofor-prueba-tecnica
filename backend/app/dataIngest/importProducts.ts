import fs from "node:fs";
import path from "node:path";
import { from as copyFrom } from "pg-copy-streams";
import type { PoolClient } from "pg";

const filePath = path.resolve(process.cwd(), "app/dataset/products.csv");

export async function importProducts(client: PoolClient): Promise<void> {
  try {
    await client.query(
      `
      CREATE TEMP TABLE staging_products (
        sku TEXT,
        name TEXT,
        price NUMERIC(10, 2),
        stock INT
      ) ON COMMIT DROP;
      `,
    );

    const copyStream = await client.query(
      copyFrom(
        `
        COPY staging_products (sku, name, price, stock) FROM STDIN
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
      INSERT INTO products (sku, name, price, stock)
      SELECT sku, name, price, stock
      FROM staging_products
      `,
    );

    console.log(
      "Los registros del archivo products.csv han sido importados exitosamente",
    );
  } catch (error) {
    console.error("No se pudo realizar la importación de products.csv");
    throw error;
  }
}

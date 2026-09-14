import fs from "node:fs";
import path from "node:path";
import { from as copyFrom } from "pg-copy-streams";
import type { PoolClient } from "pg";

const filePath = path.resolve(process.cwd(), "app/dataset/customers.csv");

export async function importCustomers(client: PoolClient): Promise<void> {
  try {
    await client.query(
      `
      CREATE TEMP TABLE staging_customers (
        email TEXT,
        full_name TEXT,
        city TEXT

      ) ON COMMIT DROP;
      `,
    );

    const copyStream = await client.query(
      copyFrom(
        `
        COPY staging_customers (email, full_name, city) FROM STDIN
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
      INSERT INTO customers (email, full_name, city)
      SELECT email, full_name, city
      FROM staging_customers
      `,
    );

    console.log(
      "Los registros del archivo customers.csv han sido importados exitosamente",
    );
  } catch (error) {
    console.error("No se pudo realizar la importación de customers.csv");
    throw error;
  }
}

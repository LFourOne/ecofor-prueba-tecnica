import { type Request, type Response } from "express";
import Router from "express";
import { body, validationResult } from "express-validator";
import { pool } from "../config/db.ts";
import crypto from "node:crypto";

export const ordersRouter = Router();

ordersRouter.post(
  "/",
  [
    body("customer_id")
      .isInt({ min: 1 })
      .withMessage("customer_id debe ser un entero positivo"),
    body("items")
      .isArray({ min: 1 })
      .withMessage("items debe ser un arreglo no vacío"),
    body("items.*.product_id")
      .isInt({ min: 1 })
      .withMessage("product_id debe ser un entero positivo"),
    body("items.*.quantity")
      .isInt({ min: 1 })
      .withMessage("quantity debe ser un entero positivo"),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res
        .status(400)
        .json({ error: "Payload inválido", details: errors.array() });
    }

    const customer_id = req.body.customer_id;
    const items = req.body.items;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const customerResult = await client.query(
        `
        SELECT customer_id, email, full_name FROM customers
        WHERE customer_id = $1;
        `,
        [customer_id],
      );

      if (customerResult.rowCount === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({ error: "Cliente no encontrado" });
      }

      const productIds = items.map(
        (item: { product_id: number }) => item.product_id,
      );

      const productsResult = await client.query(
        `
        SELECT product_id, sku, name, price, stock FROM products
        WHERE product_id = ANY($1::bigint[])
        ORDER BY product_id
        FOR UPDATE
        `,
        [productIds],
      );

      if (productsResult.rowCount !== productIds.length) {
        await client.query("ROLLBACK");

        return res
          .status(404)
          .json({ error: "Uno o más productos no existen" });
      }

      for (const item of items) {
        const product = productsResult.rows.find(
          (product) => Number(product.product_id) === item.product_id,
        );

        if (product.stock < item.quantity) {
          await client.query("ROLLBACK");

          return res.status(409).json({
            error: "Stock insuficiente",
            product_id: product.product_id,
            available: product.stock,
            requested: item.quantity,
          });
        }
      }

      const orderRef = `ORD-${crypto.randomUUID()}`;

      const orderResult = await client.query(
        `
        INSERT INTO orders (order_ref, customer_email, status, created_at)
        VALUES ($1, $2, 'pending', CURRENT_TIMESTAMP)
        RETURNING order_ref, customer_email, status, created_at;
        `,
        [orderRef, customerResult.rows[0].email],
      );

      const createdItems = [];

      for (const item of items) {
        const product = productsResult.rows.find(
          (product) => Number(product.product_id) === item.product_id,
        )!;

        const itemResult = await client.query(
          `
          INSERT INTO order_items (
            order_ref,
            sku,
            quantity,
            unit_price
          )
          VALUES ($1, $2, $3, $4)
          RETURNING order_item_id, order_ref, sku, quantity, unit_price;
          `,
          [orderRef, product.sku, item.quantity, product.price],
        );

        await client.query(
          `
          UPDATE products
          SET stock = stock - $1
          WHERE product_id = $2;
          `,
          [item.quantity, product.product_id],
        );

        createdItems.push(itemResult.rows[0]);
      }

      await client.query("COMMIT");

      return res.status(201).json({
        order: orderResult.rows[0],
        items: createdItems,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error en la creación del pedido: ", error);
      return res.status(500).json({
        error: "Hubo un error en la creación del pedido",
      });
    } finally {
      client.release();
    }
  },
);

ordersRouter.get("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const orderResult = await pool.query(
      `
      SELECT 
      o.order_ref, o.status, o.created_at,
      c.customer_id, c.email AS customer_email, c.full_name AS customer_name, c.city AS customer_city,
      oi.order_item_id, oi.quantity, oi.unit_price,
      p.product_id, p.sku, p.name AS product_name
      FROM orders o
      INNER JOIN customers c
      ON c.email = o.customer_email
      INNER JOIN order_items oi
      ON oi.order_ref = o.order_ref
      INNER JOIN products p
      ON p.sku = oi.sku
      WHERE o.order_ref = $1
      ORDER BY oi.order_item_id;
      `,
      [id],
    );

    if (orderResult.rowCount === 0) {
      return res.status(404).json({
        error: "No se ha encontrado el pedido o no existe",
      });
    }

    const orderInfo = orderResult.rows[0];

    const order = {
      order_ref: orderInfo.order_ref,
      status: orderInfo.status,
      created_at: orderInfo.created_at,
      customer: {
        customer_id: orderInfo.customer_id,
        email: orderInfo.customer_email,
        full_name: orderInfo.customer_name,
        city: orderInfo.customer_city,
      },
      items: orderResult.rows.map((row) => ({
        order_item_id: row.order_item_id,
        product_id: row.product_id,
        sku: row.sku,
        product_name: row.product_name,
        quantity: row.quantity,
        unit_price: row.unit_price,
      })),
    };

    return res.status(200).json(order);
  } catch (error) {
    console.error("Error obteniendo el pedido:", error);

    return res.status(500).json({
      error: "No se pudo obtener el pedido",
    });
  }
});

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

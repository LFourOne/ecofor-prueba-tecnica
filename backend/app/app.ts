import express, { type Express } from "express";
import cors from "cors";
import { ordersRouter } from "./routes/router.ts";

export const app: Express = express();

app.use(express.json());

app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.use("/orders", ordersRouter);

app.listen(3000, () => {
  console.log("Servidor abierto en el puerto 3000");
});

# 2. Persistencia

El modelo utiliza identificadores técnicos generados por PostgreSQL para las entidades customers, products y order_items, debido a que algunos campos proporcionados por los datasets no son únicos.

customers.customer_id: PK.
products.product_id: PK.
orders.order_ref: PK, ya que es único en el dataset.
order_items.order_item_id: PK.

Los campos email, sku y la combinación (order_ref, sku) no se utilizan como claves primarias debido a diversas duplicidades detectadas en los datasets.

Durante el análisis también se detectaron 15.000 order_ref presentes en order_items que no existen en orders. Por este motivo no se utiliza una FK entre ambas tablas, ya que impediría almacenar la totalidad del dataset proporcionado.

## Ingesta

La ingesta utiliza COPY de PostgreSQL hacia tablas temporales de staging, evitando procesar individualmente los millones de registros desde Node.js.

La ejecución completa se realiza dentro de una única transacción:

BEGIN
↓
TRUNCATE ... RESTART IDENTITY
↓
customers
↓
products
↓
orders
↓
order_items
↓
COMMIT

Si alguna etapa falla, se ejecuta ROLLBACK, evitando dejar un estado parcialmente actualizado.

Los importadores reciben una misma conexión PoolClient y no gestionan transacciones individualmente. La transacción es responsabilidad del orquestador de la ingesta.

## Idempotencia

La estrategia TRUNCATE + INSERT permite reconstruir completamente el estado de la base de datos a partir de los datasets originales.

La ejecución fue realizada dos veces consecutivas y ambas produjeron:

Tabla Registros
customers 50.000
products 10.000
orders 1.000.000
order_items 3.000.000

Por lo tanto, ejecutar nuevamente el proceso no acumula registros ni genera duplicados.

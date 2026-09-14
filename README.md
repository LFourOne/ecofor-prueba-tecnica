# Instalación y ejecución
## Requisitos
- Node.js 20+
- pnpm
- PostgreSQL 15+

## 1. Clonar el repositorio

```
git clone https://github.com/LFourOne/ecofor-prueba-tecnica.git
cd ecofor-prueba-tecnica
```

## 2. Instalar dependencias
```
pnpm install
```

## 3. Configurar variables de entorno (.env)
Crear el archivo ".env" dentro de backend/ con las credenciales de PostgreSQL:
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=prueba_tecnica
DB_USER=tu_usuario
DB_PASSWORD=tu_password
```

## 4. Agregar los datasets
Los archivos ".csv" no fueron considerados debido a su tamaño.
```
backend/
└── app/
    └── dataset/
        ├── customers.csv
        ├── products.csv
        ├── orders.csv
        └── order_items.csv
```

## 5. Ejecutar la ingesta de datos
Desde la carpeta "backend/"
```
node app/dataIngest/import.ts
```

## 6. Iniciar el servidor
Desde la carpeta "backend/"
```
pnpm dev
```
# 1. Modelo de datos

La aplicación utiliza PostgreSQL 15+ y consta con las siguientes entidades:
- customers
- products
- orders
- order_items

## DDL
```
CREATE TABLE customers (
    customer_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    city TEXT NOT NULL
);

CREATE TABLE products (
    product_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    stock INTEGER NOT NULL
);

CREATE TABLE orders (
    order_ref TEXT PRIMARY KEY,
    customer_email TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT orders_customer_email_fkey
        FOREIGN KEY (customer_email)
        REFERENCES customers(email)
);

CREATE TABLE order_items (
    order_item_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_ref TEXT NOT NULL,
    sku TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL,

    CONSTRAINT order_items_order_ref_fkey
        FOREIGN KEY (order_ref)
        REFERENCES orders(order_ref),

    CONSTRAINT order_items_sku_fkey
        FOREIGN KEY (sku)
        REFERENCES products(sku)
);
```

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

1. **BEGIN**
2. `TRUNCATE ... RESTART IDENTITY`
3. `customers`
4. `products`
5. `orders`
6. `order_items`
7. **COMMIT**

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

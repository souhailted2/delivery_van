import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  real,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Branches (نقاط البيع)
export const branchesTable = pgTable("branches", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  phone: text("phone"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export const insertBranchSchema = createInsertSchema(branchesTable).omit({ id: true, createdAt: true });
export type InsertBranch = z.infer<typeof insertBranchSchema>;
export type Branch = typeof branchesTable.$inferSelect;

// Categories
export const categoriesTable = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  syncId: text("sync_id").unique(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
});
export const insertCategorySchema = createInsertSchema(categoriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categoriesTable.$inferSelect;

// Users
export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  role: text("role").notNull().default("vendeur"), // admin | vendeur
  branchId: integer("branch_id"), // null = super admin (all branches)
  truckId: integer("truck_id"),
  canDeleteInvoice: boolean("can_delete_invoice").notNull().default(false),
  canEditPrice: boolean("can_edit_price").notNull().default(false),
  canSellOnCredit: boolean("can_sell_on_credit").notNull().default(true),
  canViewReports: boolean("can_view_reports").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  syncId: text("sync_id").unique(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
});
export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

// Products (shared across all branches)
export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  barcode: text("barcode"),
  categoryId: integer("category_id"),
  stockQuantity: numeric("stock_quantity", { precision: 10, scale: 3 }).notNull().default("0"),
  purchasePrice: numeric("purchase_price", { precision: 12, scale: 2 }).notNull().default("0"),
  sellingPriceRetail: numeric("selling_price_retail", { precision: 12, scale: 2 }).notNull().default("0"),
  sellingPriceHalfWholesale: numeric("selling_price_half_wholesale", { precision: 12, scale: 2 }).notNull().default("0"),
  sellingPriceWholesale: numeric("selling_price_wholesale", { precision: 12, scale: 2 }).notNull().default("0"),
  commissionRetail: numeric("commission_retail", { precision: 5, scale: 2 }).notNull().default("0"),
  commissionHalf: numeric("commission_half", { precision: 5, scale: 2 }).notNull().default("0"),
  commissionWholesale: numeric("commission_wholesale", { precision: 5, scale: 2 }).notNull().default("0"),
  imageUrl: text("image_url"),
  unit: text("unit").notNull().default("unité"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  syncId: text("sync_id").unique(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
});
export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;

// Suppliers (shared)
export const suppliersTable = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  balance: numeric("balance", { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  syncId: text("sync_id").unique(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
});
export const insertSupplierSchema = createInsertSchema(suppliersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type Supplier = typeof suppliersTable.$inferSelect;

// Purchase orders — per branch
export const purchasesTable = pgTable("purchases", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id"), // which branch receives the stock
  supplierId: integer("supplier_id").notNull(),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  paymentStatus: text("payment_status").notNull().default("pending"), // pending | partial | paid
  createdAt: timestamp("created_at").notNull().defaultNow(),
  syncId: text("sync_id").unique(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
});
export const insertPurchaseSchema = createInsertSchema(purchasesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPurchase = z.infer<typeof insertPurchaseSchema>;
export type Purchase = typeof purchasesTable.$inferSelect;

export const purchaseItemsTable = pgTable("purchase_items", {
  id: serial("id").primaryKey(),
  purchaseId: integer("purchase_id").notNull(),
  productId: integer("product_id").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull(),
  purchasePrice: numeric("purchase_price", { precision: 12, scale: 2 }).notNull(),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
  syncId: text("sync_id").unique(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
});
export const insertPurchaseItemSchema = createInsertSchema(purchaseItemsTable).omit({ id: true, updatedAt: true });
export type InsertPurchaseItem = z.infer<typeof insertPurchaseItemSchema>;
export type PurchaseItem = typeof purchaseItemsTable.$inferSelect;

// Warehouse stock — per branch (replaces products.stock_quantity for branch isolation)
export const warehouseStockTable = pgTable("warehouse_stock", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id").notNull(),
  productId: integer("product_id").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull().default("0"),
});
export const insertWarehouseStockSchema = createInsertSchema(warehouseStockTable).omit({ id: true });
export type InsertWarehouseStock = z.infer<typeof insertWarehouseStockSchema>;
export type WarehouseStock = typeof warehouseStockTable.$inferSelect;

// Clients — per branch
export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  clientType: text("client_type").notNull().default("retail"), // retail | half_wholesale | wholesale
  branchId: integer("branch_id"), // which branch owns this client
  truckId: integer("truck_id"), // null = admin-level client; set = truck-owned
  latitude: real("latitude"),
  longitude: real("longitude"),
  balance: numeric("balance", { precision: 12, scale: 2 }).notNull().default("0"), // negative = debt
  createdAt: timestamp("created_at").notNull().defaultNow(),
  syncId: text("sync_id").unique(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
});
export const insertClientSchema = createInsertSchema(clientsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clientsTable.$inferSelect;

// Trucks — per branch
export const trucksTable = pgTable("trucks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  plateNumber: text("plate_number"),
  branchId: integer("branch_id"), // which branch this truck belongs to
  vendeurId: integer("vendeur_id"),
  driverName: text("driver_name"),
  passwordHash: text("password_hash"),
  location: text("location"),
  cashBalance: numeric("cash_balance", { precision: 12, scale: 2 }).notNull().default("0"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  syncId: text("sync_id").unique(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
});
export const insertTruckSchema = createInsertSchema(trucksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTruck = z.infer<typeof insertTruckSchema>;
export type Truck = typeof trucksTable.$inferSelect;

// Truck stock
export const truckStockTable = pgTable("truck_stock", {
  id: serial("id").primaryKey(),
  truckId: integer("truck_id").notNull(),
  productId: integer("product_id").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull().default("0"),
  syncId: text("sync_id").unique(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
});
export const insertTruckStockSchema = createInsertSchema(truckStockTable).omit({ id: true, updatedAt: true });
export type InsertTruckStock = z.infer<typeof insertTruckStockSchema>;
export type TruckStock = typeof truckStockTable.$inferSelect;

// Stock transfers (warehouse -> truck)
export const stockTransfersTable = pgTable("stock_transfers", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id"), // which branch warehouse
  truckId: integer("truck_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  syncId: text("sync_id").unique(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
});
export const insertStockTransferSchema = createInsertSchema(stockTransfersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStockTransfer = z.infer<typeof insertStockTransferSchema>;
export type StockTransfer = typeof stockTransfersTable.$inferSelect;

export const stockTransferItemsTable = pgTable("stock_transfer_items", {
  id: serial("id").primaryKey(),
  transferId: integer("transfer_id").notNull(),
  productId: integer("product_id").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull(),
  syncId: text("sync_id").unique(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
});
export const insertStockTransferItemSchema = createInsertSchema(stockTransferItemsTable).omit({ id: true, updatedAt: true });
export type InsertStockTransferItem = z.infer<typeof insertStockTransferItemSchema>;
export type StockTransferItem = typeof stockTransferItemsTable.$inferSelect;

// Invoices
export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invoiceNumber: text("invoice_number").notNull(),
  truckId: integer("truck_id").notNull(),
  clientId: integer("client_id").notNull(),
  paymentType: text("payment_type").notNull().default("cash"), // cash | credit
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  totalCommission: numeric("total_commission", { precision: 12, scale: 2 }).notNull().default("0"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  syncId: text("sync_id").unique(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
});
export const insertInvoiceSchema = createInsertSchema(invoicesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoicesTable.$inferSelect;

export const invoiceItemsTable = pgTable("invoice_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull(),
  productId: integer("product_id").notNull(),
  productName: text("product_name").notNull().default(""),
  quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull(),
  priceType: text("price_type").notNull().default("retail"), // retail | half_wholesale | wholesale
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  commission: numeric("commission", { precision: 12, scale: 2 }).notNull().default("0"),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
  syncId: text("sync_id").unique(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
});
export const insertInvoiceItemSchema = createInsertSchema(invoiceItemsTable).omit({ id: true, updatedAt: true });
export type InsertInvoiceItem = z.infer<typeof insertInvoiceItemSchema>;
export type InvoiceItem = typeof invoiceItemsTable.$inferSelect;

// Returns
export const returnsTable = pgTable("returns", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // client_return | truck_return
  truckId: integer("truck_id"),
  clientId: integer("client_id"),
  invoiceId: integer("invoice_id"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  syncId: text("sync_id").unique(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
});
export const insertReturnSchema = createInsertSchema(returnsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertReturn = z.infer<typeof insertReturnSchema>;
export type Return = typeof returnsTable.$inferSelect;

export const returnItemsTable = pgTable("return_items", {
  id: serial("id").primaryKey(),
  returnId: integer("return_id").notNull(),
  productId: integer("product_id").notNull(),
  productName: text("product_name").notNull().default(""),
  quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
  syncId: text("sync_id").unique(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
});
export const insertReturnItemSchema = createInsertSchema(returnItemsTable).omit({ id: true, updatedAt: true });
export type InsertReturnItem = z.infer<typeof insertReturnItemSchema>;
export type ReturnItem = typeof returnItemsTable.$inferSelect;

// Company settings (global, single row)
export const companySettingsTable = pgTable("company_settings", {
  id: serial("id").primaryKey(),
  storeName: text("store_name").notNull().default("VanSales ERP"),
  phone: text("phone").notNull().default(""),
  address: text("address").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const insertCompanySettingsSchema = createInsertSchema(companySettingsTable).omit({ id: true, updatedAt: true });
export type InsertCompanySettings = z.infer<typeof insertCompanySettingsSchema>;
export type CompanySettings = typeof companySettingsTable.$inferSelect;

// Cash transfers
export const cashTransfersTable = pgTable("cash_transfers", {
  id: serial("id").primaryKey(),
  truckId: integer("truck_id").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  syncId: text("sync_id").unique(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
});
export const insertCashTransferSchema = createInsertSchema(cashTransfersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCashTransfer = z.infer<typeof insertCashTransferSchema>;
export type CashTransfer = typeof cashTransfersTable.$inferSelect;

import { Schema, Document } from 'mongoose';

export interface Product extends Document {
  sku: string;
  name: string;
  category: 'Tickets' | 'Merch' | 'Subscriptions';
  unitCost: number;
}

export const ProductSchema = new Schema<Product>(
  {
    sku: { type: String, required: true },
    name: { type: String, required: true },
    category: { type: String, required: true, enum: ['Tickets', 'Merch', 'Subscriptions'] },
    unitCost: { type: Number, required: true },
  },
  { collection: 'products' },
);


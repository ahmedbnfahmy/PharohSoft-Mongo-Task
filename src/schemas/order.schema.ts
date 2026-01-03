import { Schema, Document, Types } from 'mongoose';

export interface Order extends Document {
  customerId: Types.ObjectId;
  status: 'completed' | 'canceled';
  currency: string;
  placedAt: Date;
}

export const OrderSchema = new Schema<Order>(
  {
    customerId: { type: Schema.Types.ObjectId, required: true, ref: 'Customer' },
    status: { type: String, required: true, enum: ['completed', 'canceled'] },
    currency: { type: String, required: true },
    placedAt: { type: Date, required: true },
  },
  { collection: 'orders' },
);


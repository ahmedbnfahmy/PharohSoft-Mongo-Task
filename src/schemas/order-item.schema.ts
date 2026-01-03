import { Schema, Document, Types } from 'mongoose';

export interface OrderItem extends Document {
  orderId: Types.ObjectId;
  productId: Types.ObjectId;
  qty: number;
  unitPrice: number;
}

export const OrderItemSchema = new Schema<OrderItem>(
  {
    orderId: { type: Schema.Types.ObjectId, required: true, ref: 'Order' },
    productId: { type: Schema.Types.ObjectId, required: true, ref: 'Product' },
    qty: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
  },
  { collection: 'order_items' },
);


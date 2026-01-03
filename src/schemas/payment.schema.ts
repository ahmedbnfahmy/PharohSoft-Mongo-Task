import { Schema, Document, Types } from 'mongoose';

export interface Payment extends Document {
  orderId: Types.ObjectId;
  kind: 'charge' | 'refund';
  amount: number;
  provider: 'stripe' | 'paypal' | 'test';
  status: 'succeeded' | 'failed';
  paidAt: Date;
}

export const PaymentSchema = new Schema<Payment>(
  {
    orderId: { type: Schema.Types.ObjectId, required: true, ref: 'Order' },
    kind: { type: String, required: true, enum: ['charge', 'refund'] },
    amount: { type: Number, required: true },
    provider: { type: String, required: true, enum: ['stripe', 'paypal', 'test'] },
    status: { type: String, required: true, enum: ['succeeded', 'failed'] },
    paidAt: { type: Date, required: true },
  },
  { collection: 'payments' },
);


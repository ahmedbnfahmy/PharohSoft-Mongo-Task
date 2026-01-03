import { Schema, Document } from 'mongoose';

export interface Customer extends Document {
  fullName: string;
  country: 'EG' | 'UAE';
  createdAt: Date;
}

export const CustomerSchema = new Schema<Customer>(
  {
    fullName: { type: String, required: true },
    country: { type: String, required: true, enum: ['EG', 'UAE'] },
    createdAt: { type: Date, required: true },
  },
  { collection: 'customers' },
);


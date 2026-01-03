import mongoose from 'mongoose';
import { Types } from 'mongoose';

const seedData = async () => {
  const connectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017/test';
  
  try {
    await mongoose.connect(connectionString);
    console.log('Connected to MongoDB for seeding');

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not available');
    }
    
    await db.collection('customers').deleteMany({});
    await db.collection('products').deleteMany({});
    await db.collection('orders').deleteMany({});
    await db.collection('order_items').deleteMany({});
    await db.collection('payments').deleteMany({});

    await db.collection('customers').insertMany([
      { _id: new Types.ObjectId('656000000000000000000001'), fullName: 'Ahmed Ali', country: 'EG', createdAt: new Date('2025-09-20T10:00:00.000Z') },
      { _id: new Types.ObjectId('656000000000000000000002'), fullName: 'Mona Saad', country: 'EG', createdAt: new Date('2025-11-05T12:00:00.000Z') },
      { _id: new Types.ObjectId('656000000000000000000003'), fullName: 'Sara Noor', country: 'UAE', createdAt: new Date('2025-10-10T09:00:00.000Z') },
      { _id: new Types.ObjectId('656000000000000000000004'), fullName: 'Omar Hassan', country: 'UAE', createdAt: new Date('2025-08-01T08:00:00.000Z') },
    ]);

    await db.collection('products').insertMany([
      { _id: new Types.ObjectId('657000000000000000000001'), sku: 'TICK-STD', name: 'Standard Ticket', category: 'Tickets', unitCost: 60 },
      { _id: new Types.ObjectId('657000000000000000000002'), sku: 'MERCH-TS', name: 'T-Shirt', category: 'Merch', unitCost: 20 },
      { _id: new Types.ObjectId('657000000000000000000003'), sku: 'SUB-MON', name: 'Monthly Sub', category: 'Subscriptions', unitCost: 150 },
    ]);

    await db.collection('orders').insertMany([
      { _id: new Types.ObjectId('658000000000000000000001'), customerId: new Types.ObjectId('656000000000000000000001'), status: 'completed', currency: 'USD', placedAt: new Date('2025-10-02T08:00:00.000Z') },
      { _id: new Types.ObjectId('658000000000000000000002'), customerId: new Types.ObjectId('656000000000000000000001'), status: 'completed', currency: 'USD', placedAt: new Date('2025-11-15T14:00:00.000Z') },
      { _id: new Types.ObjectId('658000000000000000000003'), customerId: new Types.ObjectId('656000000000000000000002'), status: 'completed', currency: 'USD', placedAt: new Date('2025-12-01T10:30:00.000Z') },
      { _id: new Types.ObjectId('658000000000000000000004'), customerId: new Types.ObjectId('656000000000000000000003'), status: 'canceled', currency: 'USD', placedAt: new Date('2025-10-20T11:00:00.000Z') },
      { _id: new Types.ObjectId('658000000000000000000005'), customerId: new Types.ObjectId('656000000000000000000004'), status: 'completed', currency: 'USD', placedAt: new Date('2025-10-25T16:00:00.000Z') },
      { _id: new Types.ObjectId('658000000000000000000006'), customerId: new Types.ObjectId('656000000000000000000003'), status: 'completed', currency: 'USD', placedAt: new Date('2025-12-20T18:00:00.000Z') },
    ]);

    await db.collection('order_items').insertMany([
      { _id: new Types.ObjectId('659000000000000000000001'), orderId: new Types.ObjectId('658000000000000000000001'), productId: new Types.ObjectId('657000000000000000000001'), qty: 2, unitPrice: 100 },
      { _id: new Types.ObjectId('659000000000000000000002'), orderId: new Types.ObjectId('658000000000000000000001'), productId: new Types.ObjectId('657000000000000000000002'), qty: 1, unitPrice: 50 },
      { _id: new Types.ObjectId('659000000000000000000003'), orderId: new Types.ObjectId('658000000000000000000002'), productId: new Types.ObjectId('657000000000000000000001'), qty: 1, unitPrice: 130 },
      { _id: new Types.ObjectId('659000000000000000000004'), orderId: new Types.ObjectId('658000000000000000000003'), productId: new Types.ObjectId('657000000000000000000003'), qty: 1, unitPrice: 300 },
      { _id: new Types.ObjectId('659000000000000000000005'), orderId: new Types.ObjectId('658000000000000000000004'), productId: new Types.ObjectId('657000000000000000000001'), qty: 1, unitPrice: 100 },
      { _id: new Types.ObjectId('659000000000000000000006'), orderId: new Types.ObjectId('658000000000000000000005'), productId: new Types.ObjectId('657000000000000000000002'), qty: 4, unitPrice: 40 },
      { _id: new Types.ObjectId('659000000000000000000007'), orderId: new Types.ObjectId('658000000000000000000006'), productId: new Types.ObjectId('657000000000000000000001'), qty: 3, unitPrice: 90 },
    ]);

    await db.collection('payments').insertMany([
      { _id: new Types.ObjectId('65a000000000000000000001'), orderId: new Types.ObjectId('658000000000000000000001'), kind: 'charge', amount: 250, provider: 'stripe', status: 'succeeded', paidAt: new Date('2025-10-02T08:05:00.000Z') },
      { _id: new Types.ObjectId('65a000000000000000000002'), orderId: new Types.ObjectId('658000000000000000000002'), kind: 'charge', amount: 130, provider: 'stripe', status: 'succeeded', paidAt: new Date('2025-11-15T14:05:00.000Z') },
      { _id: new Types.ObjectId('65a000000000000000000003'), orderId: new Types.ObjectId('658000000000000000000002'), kind: 'refund', amount: 20, provider: 'stripe', status: 'succeeded', paidAt: new Date('2025-11-16T09:00:00.000Z') },
      { _id: new Types.ObjectId('65a000000000000000000004'), orderId: new Types.ObjectId('658000000000000000000003'), kind: 'charge', amount: 300, provider: 'paypal', status: 'succeeded', paidAt: new Date('2025-12-01T10:40:00.000Z') },
      { _id: new Types.ObjectId('65a000000000000000000005'), orderId: new Types.ObjectId('658000000000000000000004'), kind: 'charge', amount: 100, provider: 'stripe', status: 'succeeded', paidAt: new Date('2025-10-20T11:10:00.000Z') },
      { _id: new Types.ObjectId('65a000000000000000000006'), orderId: new Types.ObjectId('658000000000000000000005'), kind: 'charge', amount: 160, provider: 'stripe', status: 'succeeded', paidAt: new Date('2025-10-25T16:05:00.000Z') },
      { _id: new Types.ObjectId('65a000000000000000000007'), orderId: new Types.ObjectId('658000000000000000000005'), kind: 'charge', amount: 999, provider: 'test', status: 'succeeded', paidAt: new Date('2025-10-25T16:06:00.000Z') },
      { _id: new Types.ObjectId('65a000000000000000000008'), orderId: new Types.ObjectId('658000000000000000000006'), kind: 'charge', amount: 270, provider: 'stripe', status: 'succeeded', paidAt: new Date('2025-12-20T18:05:00.000Z') },
      { _id: new Types.ObjectId('65a000000000000000000009'), orderId: new Types.ObjectId('658000000000000000000006'), kind: 'charge', amount: 270, provider: 'stripe', status: 'failed', paidAt: new Date('2025-12-20T18:04:00.000Z') },
    ]);

    console.log('Seed data inserted successfully');
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }
};

seedData();


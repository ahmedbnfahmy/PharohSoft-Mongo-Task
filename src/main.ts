import mongoose from 'mongoose';
import { Model } from 'mongoose';
import { AnalyticsService } from './services/analytics.service';
import { Order, OrderSchema } from './schemas/order.schema';

async function main() {
  const connectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017/test';
  
  try {
    await mongoose.connect(connectionString);
    console.log('Connected to MongoDB');

    const OrderModel = mongoose.model<Order>('Order', OrderSchema);
    const analyticsService = new AnalyticsService(OrderModel);

    console.log('\nRunning analytics pipeline...\n');
    const results = await analyticsService.getAnalyticsByCountry();

    console.log('Results:');
    console.log(JSON.stringify(results, null, 2));

    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();


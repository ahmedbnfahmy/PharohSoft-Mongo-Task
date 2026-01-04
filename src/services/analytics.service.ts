import { Model } from 'mongoose';
import { Order } from '../schemas/order.schema';

export class AnalyticsService {
  constructor(private orderModel: Model<Order>) {}

  async getAnalyticsByCountry(): Promise<any[]> {
    const fromDate = new Date('2025-09-30T22:00:00.000Z');
    const toDate = new Date('2025-12-31T22:00:00.000Z');

    const pipeline = [
      // 1. Filter: Only completed orders in date range
      {
        $match: {
          status: 'completed',
          placedAt: { $gte: fromDate, $lt: toDate },
        },
      },

      // 2. Join customer
      {
        $lookup: {
          from: 'customers',
          localField: 'customerId',
          foreignField: '_id',
          as: 'customer',
        },
      },
      { $unwind: '$customer' },

      // 3. Join payments and calculate net revenue
      {
        $lookup: {
          from: 'payments',
          let: { orderId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$orderId', '$$orderId'] },
                status: 'succeeded',
                provider: { $ne: 'test' },
              },
            },
          ],
          as: 'payments',
        },
      },

      // 4. Join items with products
      {
        $lookup: {
          from: 'order_items',
          let: { orderId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$orderId', '$$orderId'] } } },
            {
              $lookup: {
                from: 'products',
                localField: 'productId',
                foreignField: '_id',
                as: 'product',
              },
            },
            { $unwind: '$product' },
          ],
          as: 'items',
        },
      },

      // 5. Calculate order-level metrics
      {
        $addFields: {
          // Net revenue = sum(charges) - sum(refunds)
          orderNetRevenue: {
            $subtract: [
              {
                $sum: {
                  $map: {
                    input: { $filter: { input: '$payments', as: 'p', cond: { $eq: ['$$p.kind', 'charge'] } } },
                    as: 'c',
                    in: '$$c.amount',
                  },
                },
              },
              {
                $sum: {
                  $map: {
                    input: { $filter: { input: '$payments', as: 'p', cond: { $eq: ['$$p.kind', 'refund'] } } },
                    as: 'r',
                    in: '$$r.amount',
                  },
                },
              },
            ],
          },
          // Gross = sum(qty * unitPrice)
          orderGross: {
            $sum: { $map: { input: '$items', as: 'i', in: { $multiply: ['$$i.qty', '$$i.unitPrice'] } } },
          },
          // COGS = sum(qty * unitCost)
          orderCOGS: {
            $sum: { $map: { input: '$items', as: 'i', in: { $multiply: ['$$i.qty', '$$i.product.unitCost'] } } },
          },
        },
      },

      // 6. Unwind items and calculate category revenue allocation
      { $unwind: '$items' },
      {
        $addFields: {
          itemExtPrice: { $multiply: ['$items.qty', '$items.unitPrice'] },
        },
      },
      {
        $addFields: {
          // itemNet = orderNetRevenue * (itemExtPrice / orderGross)
          itemNet: {
            $cond: [
              { $gt: ['$orderGross', 0] },
              { $multiply: ['$orderNetRevenue', { $divide: ['$itemExtPrice', '$orderGross'] }] },
              0,
            ],
          },
        },
      },

      // 7. Group by order to get per-order metrics and category splits
      {
        $group: {
          _id: '$_id',
          country: { $first: '$customer.country' },
          customerId: { $first: '$customerId' },
          customerCreatedAt: { $first: '$customer.createdAt' },
          orderCOGS: { $first: '$orderCOGS' },
          orderNetRevenue: { $first: '$orderNetRevenue' },
          categories: {
            $push: {
              category: '$items.product.category',
              net: '$itemNet',
            },
          },
        },
      },

      // 8. Group by customer to count orders per customer
      {
        $group: {
          _id: { country: '$country', customerId: '$customerId' },
          customerCreatedAt: { $first: '$customerCreatedAt' },
          orderCount: { $sum: 1 },
          netRevenue: { $sum: '$orderNetRevenue' },
          cogs: { $sum: '$orderCOGS' },
          allCategories: { $push: '$categories' },
        },
      },

      // 9. Group by country
      {
        $group: {
          _id: '$_id.country',
          ordersCount: { $sum: '$orderCount' },
          uniqueCustomers: { $sum: 1 },
          newCustomers: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ['$customerCreatedAt', fromDate] }, { $lt: ['$customerCreatedAt', toDate] }] },
                1,
                0,
              ],
            },
          },
          returningCustomers: {
            $sum: { $cond: [{ $gte: ['$orderCount', 2] }, 1, 0] },
          },
          netRevenue: { $sum: '$netRevenue' },
          cogs: { $sum: '$cogs' },
          categoryData: { $push: '$allCategories' },
        },
      },

      // 10. Flatten categories and aggregate by category
      {
        $addFields: {
          flatCategories: {
            $reduce: {
              input: '$categoryData',
              initialValue: [],
              in: {
                $reduce: {
                  input: '$$this',
                  initialValue: '$$value',
                  in: { $concatArrays: ['$$value', '$$this'] },
                },
              },
            },
          },
        },
      },

      // 11. Aggregate category totals
      {
        $addFields: {
          categoryTotals: {
            $map: {
              input: ['Tickets', 'Merch', 'Subscriptions'],
              as: 'cat',
              in: {
                category: '$$cat',
                total: {
                  $sum: {
                    $map: {
                      input: { $filter: { input: '$flatCategories', as: 'c', cond: { $eq: ['$$c.category', '$$cat'] } } },
                      as: 'matched',
                      in: '$$matched.net',
                    },
                  },
                },
              },
            },
          },
        },
      },

      // 12. Find top category
      {
        $addFields: {
          topCategoryByNetRevenue: {
            $let: {
              vars: {
                top: {
                  $reduce: {
                    input: '$categoryTotals',
                    initialValue: { category: null, total: -1 },
                    in: {
                      $cond: [{ $gt: ['$$this.total', '$$value.total'] }, '$$this', '$$value'],
                    },
                  },
                },
              },
              in: '$$top.category',
            },
          },
        },
      },

      // 13. Final projection
      {
        $project: {
          _id: 0,
          country: '$_id',
          ordersCount: 1,
          uniqueCustomers: 1,
          newCustomers: 1,
          returningCustomers: 1,
          netRevenue: 1,
          cogs: 1,
          grossMargin: { $subtract: ['$netRevenue', '$cogs'] },
          aov: { $cond: [{ $gt: ['$ordersCount', 0] }, { $divide: ['$netRevenue', '$ordersCount'] }, 0] },
          topCategoryByNetRevenue: 1,
        },
      },

      // 14. Sort by revenue
      { $sort: { netRevenue: -1 } },
    ];

    return this.orderModel.aggregate(pipeline as any[]).exec();
  }
}

import { Model } from 'mongoose';
import { Order } from '../schemas/order.schema';

export class AnalyticsService {
  constructor(private orderModel: Model<Order>) {}

  async getAnalyticsByCountry(): Promise<any[]> {
    const fromDate = new Date('2025-09-30T22:00:00.000Z');
    const toDate = new Date('2025-12-31T22:00:00.000Z');
  
    const pipeline = [
      // Stage 1: Filter completed orders in date range
      {
        $match: {
          status: 'completed',
          placedAt: { $gte: fromDate, $lt: toDate },
        },
      },
  
      // Stage 2: Lookup and process in a single pipeline stage
      {
        $lookup: {
          from: 'order_items',
          localField: '_id',
          foreignField: 'orderId',
          as: 'items',
        },
      },
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: '_id',
          as: 'products',
        },
      },
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
          as: 'validPayments',
        },
      },
      {
        $lookup: {
          from: 'customers',
          localField: 'customerId',
          foreignField: '_id',
          as: 'customer',
        },
      },
      { $unwind: '$customer' },
  
      // Stage 3: Calculate order-level metrics
      {
        $addFields: {
          orderGross: {
            $sum: {
              $map: {
                input: '$items',
                as: 'i',
                in: { $multiply: ['$$i.qty', '$$i.unitPrice'] },
              },
            },
          },
          orderNetRevenue: {
            $subtract: [
              {
                $sum: {
                  $map: {
                    input: { $filter: { input: '$validPayments', as: 'p', cond: { $eq: ['$$p.kind', 'charge'] } } },
                    as: 'c',
                    in: '$$c.amount',
                  },
                },
              },
              {
                $sum: {
                  $map: {
                    input: { $filter: { input: '$validPayments', as: 'p', cond: { $eq: ['$$p.kind', 'refund'] } } },
                    as: 'r',
                    in: '$$r.amount',
                  },
                },
              },
            ],
          },
          orderCOGS: {
            $sum: {
              $map: {
                input: '$items',
                as: 'i',
                in: {
                  $multiply: [
                    '$$i.qty',
                    {
                      $let: {
                        vars: {
                          prod: {
                            $arrayElemAt: [
                              { $filter: { input: '$products', as: 'p', cond: { $eq: ['$$p._id', '$$i.productId'] } } },
                              0,
                            ],
                          },
                        },
                        in: '$$prod.unitCost',
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
  
      // Stage 4: Unwind items for category-level calculation
      { $unwind: '$items' },
      {
        $addFields: {
          itemProduct: {
            $arrayElemAt: [
              { $filter: { input: '$products', as: 'p', cond: { $eq: ['$$p._id', '$items.productId'] } } },
              0,
            ],
          },
          itemExtPrice: { $multiply: ['$items.qty', '$items.unitPrice'] },
        },
      },
      {
        $addFields: {
          itemNetRevenue: {
            $cond: {
              if: { $gt: ['$orderGross', 0] },
              then: { $multiply: ['$orderNetRevenue', { $divide: ['$itemExtPrice', '$orderGross'] }] },
              else: 0,
            },
          },
        },
      },
  
      // Stage 5: Group by country and category
      {
        $group: {
          _id: {
            country: '$customer.country',
            orderId: '$_id',
            category: '$itemProduct.category',
          },
          customerId: { $first: '$customerId' },
          customerCreatedAt: { $first: '$customer.createdAt' },
          orderNetRevenue: { $first: '$orderNetRevenue' },
          orderCOGS: { $first: '$orderCOGS' },
          categoryNet: { $sum: '$itemNetRevenue' },
        },
      },
  
      // Stage 6: Group by country and order (aggregate categories)
      {
        $group: {
          _id: { country: '$_id.country', orderId: '$_id.orderId' },
          customerId: { $first: '$customerId' },
          customerCreatedAt: { $first: '$customerCreatedAt' },
          orderNetRevenue: { $first: '$orderNetRevenue' },
          orderCOGS: { $first: '$orderCOGS' },
          categories: {
            $push: { category: '$_id.category', net: '$categoryNet' },
          },
        },
      },
  
      // Stage 7: Group by country
      {
        $group: {
          _id: '$_id.country',
          ordersCount: { $sum: 1 },
          uniqueCustomers: { $addToSet: '$customerId' },
          customerData: { $push: { id: '$customerId', createdAt: '$customerCreatedAt' } },
          orderCustomers: { $push: '$customerId' },
          netRevenue: { $sum: '$orderNetRevenue' },
          cogs: { $sum: '$orderCOGS' },
          allCategories: { $push: '$categories' },
        },
      },
  
      // Stage 8: Calculate category totals and find top category
      {
        $addFields: {
          flatCategories: {
            $reduce: {
              input: '$allCategories',
              initialValue: [],
              in: { $concatArrays: ['$$value', '$$this'] },
            },
          },
        },
      },
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
                      $cond: {
                        if: { $gt: ['$$this.total', '$$value.total'] },
                        then: '$$this',
                        else: '$$value',
                      },
                    },
                  },
                },
              },
              in: '$$top.category',
            },
          },
        },
      },
  
      // Stage 9: Calculate customer metrics
      {
        $addFields: {
          uniqueCustomersCount: { $size: '$uniqueCustomers' },
          newCustomers: {
            $size: {
              $setIntersection: [
                '$uniqueCustomers',
                {
                  $map: {
                    input: {
                      $filter: {
                        input: '$customerData',
                        as: 'c',
                        cond: {
                          $and: [
                            { $gte: ['$$c.createdAt', fromDate] },
                            { $lt: ['$$c.createdAt', toDate] },
                          ],
                        },
                      },
                    },
                    as: 'c',
                    in: '$$c.id',
                  },
                },
              ],
            },
          },
          returningCustomers: {
            $size: {
              $filter: {
                input: '$uniqueCustomers',
                as: 'custId',
                cond: {
                  $gte: [
                    {
                      $size: {
                        $filter: {
                          input: '$orderCustomers',
                          as: 'oc',
                          cond: { $eq: ['$$oc', '$$custId'] },
                        },
                      },
                    },
                    2,
                  ],
                },
              },
            },
          },
        },
      },
  
      // Stage 10: Final calculations and projection
      {
        $addFields: {
          grossMargin: { $subtract: ['$netRevenue', '$cogs'] },
          aov: {
            $cond: {
              if: { $gt: ['$ordersCount', 0] },
              then: { $divide: ['$netRevenue', '$ordersCount'] },
              else: 0,
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          country: '$_id',
          ordersCount: 1,
          uniqueCustomers: '$uniqueCustomersCount',
          newCustomers: 1,
          returningCustomers: 1,
          netRevenue: 1,
          cogs: 1,
          grossMargin: 1,
          aov: 1,
          topCategoryByNetRevenue: 1,
        },
      },
      { $sort: { netRevenue: -1 } },
    ];
  
    return this.orderModel.aggregate(pipeline as any[]).exec();
  }
}


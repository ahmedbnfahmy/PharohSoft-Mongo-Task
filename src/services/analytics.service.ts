import { Model } from 'mongoose';
import { Order } from '../schemas/order.schema';

export class AnalyticsService {
  constructor(private orderModel: Model<Order>) {}

  async getAnalyticsByCountry(): Promise<any[]> {
    const fromDate = new Date('2025-09-30T22:00:00.000Z');
    const toDate = new Date('2025-12-31T22:00:00.000Z');

    const pipeline = [
      {
        $match: {
          status: 'completed',
          placedAt: {
            $gte: fromDate,
            $lt: toDate,
          },
        },
      },
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
          localField: '_id',
          foreignField: 'orderId',
          as: 'payments',
        },
      },
      {
        $addFields: {
          validPayments: {
            $filter: {
              input: '$payments',
              as: 'payment',
              cond: {
                $and: [
                  { $eq: ['$$payment.status', 'succeeded'] },
                  { $ne: ['$$payment.provider', 'test'] },
                ],
              },
            },
          },
        },
      },
      {
        $addFields: {
          orderGrossItems: {
            $sum: {
              $map: {
                input: '$items',
                as: 'item',
                in: { $multiply: ['$$item.qty', '$$item.unitPrice'] },
              },
            },
          },
          charges: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: '$validPayments',
                    as: 'payment',
                    cond: { $eq: ['$$payment.kind', 'charge'] },
                  },
                },
                as: 'charge',
                in: '$$charge.amount',
              },
            },
          },
          refunds: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: '$validPayments',
                    as: 'payment',
                    cond: { $eq: ['$$payment.kind', 'refund'] },
                  },
                },
                as: 'refund',
                in: '$$refund.amount',
              },
            },
          },
        },
      },
      {
        $addFields: {
          orderNetRevenue: { $subtract: ['$charges', '$refunds'] },
          orderCOGS: {
            $sum: {
              $map: {
                input: '$items',
                as: 'item',
                in: {
                  $let: {
                    vars: {
                      product: {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: '$products',
                              as: 'p',
                              cond: { $eq: ['$$p._id', '$$item.productId'] },
                            },
                          },
                          0,
                        ],
                      },
                    },
                    in: { $multiply: ['$$item.qty', '$$product.unitCost'] },
                  },
                },
              },
            },
          },
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
      {
        $unwind: '$customer',
      },
      {
        $addFields: {
          itemsWithCategory: {
            $map: {
              input: '$items',
              as: 'item',
              in: {
                $let: {
                  vars: {
                    product: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: '$products',
                            as: 'p',
                            cond: { $eq: ['$$p._id', '$$item.productId'] },
                          },
                        },
                        0,
                      ],
                    },
                    itemExtPrice: {
                      $multiply: ['$$item.qty', '$$item.unitPrice'],
                    },
                  },
                  in: {
                    category: '$$product.category',
                    itemExtPrice: '$$itemExtPrice',
                    itemNet: {
                      $cond: {
                        if: { $gt: ['$orderGrossItems', 0] },
                        then: {
                          $multiply: [
                            '$orderNetRevenue',
                            {
                              $divide: ['$$itemExtPrice', '$orderGrossItems'],
                            },
                          ],
                        },
                        else: 0,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      {
        $group: {
          _id: '$customer.country',
          orders: { $push: '$$ROOT' },
          uniqueCustomers: { $addToSet: '$customerId' },
          allCustomers: { $push: '$customer' },
        },
      },
      {
        $addFields: {
          ordersCount: { $size: '$orders' },
          uniqueCustomersCount: { $size: '$uniqueCustomers' },
          netRevenue: {
            $sum: '$orders.orderNetRevenue',
          },
          cogs: {
            $sum: '$orders.orderCOGS',
          },
          newCustomers: {
            $size: {
              $setIntersection: [
                '$uniqueCustomers',
                {
                  $map: {
                    input: {
                      $filter: {
                        input: '$allCustomers',
                        as: 'customer',
                        cond: {
                          $and: [
                            { $gte: ['$$customer.createdAt', fromDate] },
                            { $lt: ['$$customer.createdAt', toDate] },
                          ],
                        },
                      },
                    },
                    as: 'customer',
                    in: '$$customer._id',
                  },
                },
              ],
            },
          },
          categoryRevenue: {
            $reduce: {
              input: '$orders',
              initialValue: { Tickets: 0, Merch: 0, Subscriptions: 0 },
              in: {
                $reduce: {
                  input: '$$this.itemsWithCategory',
                  initialValue: '$$value',
                  in: {
                    $let: {
                      vars: {
                        categoryName: '$$this.category',
                        currentValue: {
                          $let: {
                            vars: {
                              objArray: { $objectToArray: '$$value' },
                              matchingEntry: {
                                $arrayElemAt: [
                                  {
                                    $filter: {
                                      input: { $objectToArray: '$$value' },
                                      as: 'entry',
                                      cond: { $eq: ['$$entry.k', '$$this.category'] },
                                    },
                                  },
                                  0,
                                ],
                              },
                            },
                            in: { $ifNull: ['$$matchingEntry.v', 0] },
                          },
                        },
                      },
                      in: {
                        $mergeObjects: [
                          '$$value',
                          {
                            $arrayToObject: [
                              [
                                {
                                  k: '$$categoryName',
                                  v: { $add: ['$$currentValue', '$$this.itemNet'] },
                                },
                              ],
                            ],
                          },
                        ],
                      },
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
          grossMargin: { $subtract: ['$netRevenue', '$cogs'] },
          aov: {
            $cond: {
              if: { $gt: ['$ordersCount', 0] },
              then: { $divide: ['$netRevenue', '$ordersCount'] },
              else: 0,
            },
          },
          returningCustomers: {
            $size: {
              $filter: {
                input: '$uniqueCustomers',
                as: 'customerId',
                cond: {
                  $gte: [
                    {
                      $size: {
                        $filter: {
                          input: '$orders',
                          as: 'order',
                          cond: {
                            $eq: ['$$order.customerId', '$$customerId'],
                          },
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
      {
        $addFields: {
          topCategoryByNetRevenue: {
            $let: {
              vars: {
                categoryArray: { $objectToArray: '$categoryRevenue' },
              },
              in: {
                $let: {
                  vars: {
                    topCategory: {
                      $reduce: {
                        input: { $objectToArray: '$categoryRevenue' },
                        initialValue: { k: null, v: -1 },
                        in: {
                          $cond: {
                            if: { $gt: ['$$this.v', '$$value.v'] },
                            then: '$$this',
                            else: '$$value',
                          },
                        },
                      },
                    },
                  },
                  in: '$$topCategory.k',
                },
              },
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
      {
        $sort: { netRevenue: -1 },
      },
    ];

    return this.orderModel.aggregate(pipeline as any[]).exec();
  }
}


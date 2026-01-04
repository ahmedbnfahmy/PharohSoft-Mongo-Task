# MongoDB Aggregation Pipeline - Task Completion Summary

**Project:** Customer Analytics by Country  
**Date:** January 4, 2026  
**Status:** Completed  
**Time Spent:** 3-4 hours

---

## Executive Summary

Successfully implemented a MongoDB aggregation pipeline that generates analytics summaries by customer country for a specified time period (October 1, 2025 - January 1, 2026). The solution processes orders, payments, and items data to produce comprehensive business metrics.

---

## Deliverables

### 1. Mongoose Schemas (5 collections)

| Collection | File | Description |
|------------|------|-------------|
| customers | `src/schemas/customer.schema.ts` | Customer profiles with country (EG/UAE) |
| products | `src/schemas/product.schema.ts` | Product catalog with categories and costs |
| orders | `src/schemas/order.schema.ts` | Order records with status and timestamps |
| order_items | `src/schemas/order-item.schema.ts` | Line items linking orders to products |
| payments | `src/schemas/payment.schema.ts` | Payment transactions (charges/refunds) |

### 2. Aggregation Pipeline

**File:** `src/services/analytics.service.ts`

The pipeline implements all business rules:

- Filters completed orders within the specified date range
- Calculates net revenue: `sum(charges) - sum(refunds)`
- Excludes test payments and failed transactions
- Allocates revenue to categories proportionally: `itemNet = orderNetRevenue * (itemExtPrice / orderGross)`
- Computes COGS from product unit costs
- Segments customers (new vs returning)
- Identifies top-performing category per country

### 3. Test Data Seeding

**File:** `src/seed.ts`

Provides seed data matching the specification for validation.

---

## Raw Aggregation Pipeline

The complete MongoDB aggregation pipeline from `src/services/analytics.service.ts`:

```javascript
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
```

---

## Output Metrics

The pipeline returns per-country analytics:

| Metric | Description |
|--------|-------------|
| `country` | Country code (EG/UAE) |
| `ordersCount` | Number of completed orders |
| `uniqueCustomers` | Distinct customers with orders |
| `newCustomers` | Customers created during the period |
| `returningCustomers` | Customers with 2+ orders in period |
| `netRevenue` | Total net revenue (charges - refunds) |
| `cogs` | Cost of goods sold |
| `grossMargin` | Net revenue minus COGS |
| `aov` | Average order value |
| `topCategoryByNetRevenue` | Highest revenue category |

---

## Verified Output

```json
[
  {
    "country": "EG",
    "ordersCount": 3,
    "uniqueCustomers": 2,
    "newCustomers": 1,
    "returningCustomers": 1,
    "netRevenue": 660,
    "cogs": 350,
    "grossMargin": 310,
    "aov": 220,
    "topCategoryByNetRevenue": "Tickets"
  },
  {
    "country": "UAE",
    "ordersCount": 2,
    "uniqueCustomers": 2,
    "newCustomers": 1,
    "returningCustomers": 0,
    "netRevenue": 430,
    "cogs": 260,
    "grossMargin": 170,
    "aov": 215,
    "topCategoryByNetRevenue": "Tickets"
  }
]
```

---

## Technical Details

### Technology Stack

- **Runtime:** Node.js with TypeScript
- **Database:** MongoDB 3.6+
- **ODM:** Mongoose 6.x

### Project Structure

```
PharohSoft/
├── src/
│   ├── schemas/
│   │   ├── customer.schema.ts
│   │   ├── product.schema.ts
│   │   ├── order.schema.ts
│   │   ├── order-item.schema.ts
│   │   └── payment.schema.ts
│   ├── services/
│   │   └── analytics.service.ts
│   ├── main.ts
│   └── seed.ts
├── package.json
└── tsconfig.json
```

### How to Run

```bash
# Install dependencies
npm install

# Seed the database
npm run seed

# Run the analytics pipeline
npm start
```

---

## Business Rules Implemented

1. **Order Filtering:** Only completed orders within the date range
2. **Payment Processing:**
   - Only succeeded payments included
   - Test provider payments excluded
   - Handles multiple charges and refunds per order
3. **Revenue Allocation:** Proportional distribution to categories based on item value
4. **Customer Segmentation:**
   - New customers: created during the period
   - Returning customers: 2+ orders in period
5. **Metrics Calculation:**
   - COGS from product unit costs
   - Gross margin = revenue - COGS
   - AOV = revenue / orders count

---

## Conclusion

The aggregation pipeline has been successfully implemented and tested. All business requirements have been met, and the output matches the expected results from the specification.

---

**Prepared by:** Development Team  
**Reviewed:** Pending


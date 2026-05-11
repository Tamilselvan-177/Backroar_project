import { MongoUserRepository } from "./mongo/userRepository.js";
import { MongoCategoryRepository } from "./mongo/categoryRepository.js";
import { MongoBrandRepository } from "./mongo/brandRepository.js";
import { MongoModelRepository } from "./mongo/modelRepository.js";
import { MongoSubcategoryRepository } from "./mongo/subcategoryRepository.js";
import { MongoProductRepository } from "./mongo/productRepository.js";
import { MongoCartRepository } from "./mongo/cartRepository.js";
import { MongoCheckoutRepository } from "./mongo/checkoutRepository.js";
import { MongoWishlistRepository } from "./mongo/wishlistRepository.js";
import { MongoReviewRepository } from "./mongo/reviewRepository.js";
import { MongoStoreRepository } from "./mongo/storeRepository.js";
import { MongoPosCounterRepository } from "./mongo/posCounterRepository.js";
import { MongoPosOrderRepository } from "./mongo/posOrderRepository.js";
import { MongoRoleRepository } from "./mongo/roleRepository.js";
import { MongoCouponRepository } from "./mongo/couponRepository.js";
import { MongoStockTransferRepository } from "./mongo/stockTransferRepository.js";
import { MongoStockManagementRepository } from "./mongo/stockManagementRepository.js";
import { MongoIncomeExpenseRepository } from "./mongo/incomeExpenseRepository.js";
import { MongoReturnRepository } from "./mongo/returnRepository.js";
import { MongoAnalyticsRepository } from "./mongo/analyticsRepository.js";
import { MongoAttendanceRepository } from "./mongo/attendanceRepository.js";

/** All persistence goes through MongoDB repositories (no SQL in the Node API). */
export function createRepositories() {
  const stockTransfer = new MongoStockTransferRepository();
  const stockManagement = new MongoStockManagementRepository(stockTransfer);
  const incomeExpense = new MongoIncomeExpenseRepository();
  const returns = new MongoReturnRepository({ stockManagement, incomeExpense });
  return {
    users: new MongoUserRepository(),
    categories: new MongoCategoryRepository(),
    brands: new MongoBrandRepository(),
    models: new MongoModelRepository(),
    subcategories: new MongoSubcategoryRepository(),
    products: new MongoProductRepository(),
    cart: new MongoCartRepository(),
    checkout: new MongoCheckoutRepository(),
    wishlist: new MongoWishlistRepository(),
    reviews: new MongoReviewRepository(),
    stores: new MongoStoreRepository(),
    posCounters: new MongoPosCounterRepository(),
    posOrders: new MongoPosOrderRepository(),
    roles: new MongoRoleRepository(),
    coupons: new MongoCouponRepository(),
    stockTransfer,
    stockManagement,
    incomeExpense,
    returns,
    analytics: new MongoAnalyticsRepository(),
    attendance: new MongoAttendanceRepository(),
  };
}

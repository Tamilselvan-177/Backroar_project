import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./layout/Layout.jsx";
import Home from "./pages/Home.jsx";
import About from "./pages/About.jsx";
import Contact from "./pages/Contact.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Account from "./pages/Account.jsx";
import AccountProfile from "./pages/AccountProfile.jsx";
import Categories from "./pages/Categories.jsx";
import CategoryView from "./pages/CategoryView.jsx";
import ProductList from "./pages/ProductList.jsx";
import ProductDetail from "./pages/ProductDetail.jsx";
import SearchResults from "./pages/SearchResults.jsx";
import CartPage from "./pages/CartPage.jsx";
import Checkout from "./pages/Checkout.jsx";
import CheckoutSuccess from "./pages/CheckoutSuccess.jsx";
import Wishlist from "./pages/Wishlist.jsx";
import Orders from "./pages/Orders.jsx";
import OrderDetail from "./pages/OrderDetail.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import PolicyPage from "./pages/PolicyPage.jsx";
import AdminLayout from "./pages/admin/AdminLayout.jsx";
import AdminDashboard from "./pages/admin/AdminDashboard.jsx";
import AdminPlaceholder from "./pages/admin/AdminPlaceholder.jsx";
import AdminHelpPage from "./pages/admin/AdminHelpPage.jsx";
import AdminFeatureCoveragePage from "./pages/admin/AdminFeatureCoveragePage.jsx";
import AdminAnalyticsPage from "./pages/admin/AdminAnalyticsPage.jsx";
import AdminAttendancePage from "./pages/admin/AdminAttendancePage.jsx";
import AdminReviewsPage from "./pages/admin/reviews/AdminReviewsPage.jsx";
import AdminReturnsPage from "./pages/admin/returns/AdminReturnsPage.jsx";
import IncomeExpenseLayout from "./pages/admin/incomeExpense/IncomeExpenseLayout.jsx";
import IeOverview from "./pages/admin/incomeExpense/IeOverview.jsx";
import IeExpenseEntry from "./pages/admin/incomeExpense/IeExpenseEntry.jsx";
import IeExpensesList from "./pages/admin/incomeExpense/IeExpensesList.jsx";
import IeIncomeList from "./pages/admin/incomeExpense/IeIncomeList.jsx";
import IeReports from "./pages/admin/incomeExpense/IeReports.jsx";
import CategoriesPage from "./pages/admin/catalog/CategoriesPage.jsx";
import CategoryEditorPage from "./pages/admin/catalog/CategoryEditorPage.jsx";
import BrandsPage from "./pages/admin/catalog/BrandsPage.jsx";
import BrandEditorPage from "./pages/admin/catalog/BrandEditorPage.jsx";
import ModelsPage from "./pages/admin/catalog/ModelsPage.jsx";
import ModelEditorPage from "./pages/admin/catalog/ModelEditorPage.jsx";
import SubcategoriesPage from "./pages/admin/catalog/SubcategoriesPage.jsx";
import SubcategoryEditorPage from "./pages/admin/catalog/SubcategoryEditorPage.jsx";
import ProductsPage from "./pages/admin/ProductsPage.jsx";
import ProductEditorPage from "./pages/admin/catalog/ProductEditorPage.jsx";
import BulkLabelPrintPage from "./pages/admin/catalog/BulkLabelPrintPage.jsx";
import AdminOrdersPage from "./pages/admin/AdminOrdersPage.jsx";
import AdminOrderDetailPage from "./pages/admin/AdminOrderDetailPage.jsx";
import PosLoginPage from "./pages/admin/pos/PosLoginPage.jsx";
import PosBillingPage from "./pages/admin/pos/PosBillingPage.jsx";
import PosOrdersPage from "./pages/admin/pos/PosOrdersPage.jsx";
import PosOrderDetailPage from "./pages/admin/pos/PosOrderDetailPage.jsx";
import PosGstReportPage from "./pages/admin/pos/PosGstReportPage.jsx";
import PosReturnsPage from "./pages/admin/pos/PosReturnsPage.jsx";
import StoresPage from "./pages/admin/stores/StoresPage.jsx";
import StoreEditorPage from "./pages/admin/stores/StoreEditorPage.jsx";
import CountersPage from "./pages/admin/counters/CountersPage.jsx";
import CounterEditorPage from "./pages/admin/counters/CounterEditorPage.jsx";
import RolesPage from "./pages/admin/roles/RolesPage.jsx";
import RoleEditorPage from "./pages/admin/roles/RoleEditorPage.jsx";
import StaffPage from "./pages/admin/staff/StaffPage.jsx";
import StaffEditorPage from "./pages/admin/staff/StaffEditorPage.jsx";
import CouponsPage from "./pages/admin/coupons/CouponsPage.jsx";
import CouponEditorPage from "./pages/admin/coupons/CouponEditorPage.jsx";
import StockTransferPage from "./pages/admin/stock/StockTransferPage.jsx";
import StockTransferHistoryPage from "./pages/admin/stock/StockTransferHistoryPage.jsx";
import StockManagementListPage from "./pages/admin/stock/StockManagementListPage.jsx";
import StockManagementProductPage from "./pages/admin/stock/StockManagementProductPage.jsx";
import StockManagementAdjustPage from "./pages/admin/stock/StockManagementAdjustPage.jsx";
import StockManagementHistoryPage from "./pages/admin/stock/StockManagementHistoryPage.jsx";
import StockManagementLowStockPage from "./pages/admin/stock/StockManagementLowStockPage.jsx";
import AdminPermRoute from "./pages/admin/AdminPermRoute.jsx";
import { P } from "./pages/admin/adminPermKeys.js";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/account" element={<Account />} />
        <Route path="/account/profile" element={<AccountProfile />} />
        <Route path="/account/orders" element={<Orders />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/category/:slug" element={<CategoryView />} />
        <Route path="/products" element={<ProductList />} />
        <Route path="/product/:slug" element={<ProductDetail />} />
        <Route path="/search" element={<SearchResults />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/checkout/success/:orderNumber" element={<CheckoutSuccess />} />
        <Route path="/wishlist" element={<Wishlist />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/order/:orderNumber" element={<OrderDetail />} />
        <Route path="/refund-policy" element={<PolicyPage title="Refund Policy" />} />
        <Route path="/privacy-policy" element={<PolicyPage title="Privacy Policy" />} />
        <Route path="/shipping-policy" element={<PolicyPage title="Shipping Policy" />} />
        <Route path="/terms" element={<PolicyPage title="Terms and Conditions" />} />

        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="help" element={<AdminHelpPage />} />
          <Route path="feature-coverage" element={<AdminFeatureCoveragePage />} />
          <Route path="migration-parity" element={<Navigate to="/admin/feature-coverage" replace />} />
          <Route
            path="analytics"
            element={
              <AdminPermRoute perm={P.FINANCE_ANALYTICS}>
                <AdminAnalyticsPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="categories"
            element={
              <AdminPermRoute perm={P.CATALOG_CATEGORIES_VIEW}>
                <CategoriesPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="categories/create"
            element={
              <AdminPermRoute perm={P.CATALOG_CATEGORIES_CREATE}>
                <CategoryEditorPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="categories/:id/edit"
            element={
              <AdminPermRoute perm={P.CATALOG_CATEGORIES_UPDATE}>
                <CategoryEditorPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="subcategories"
            element={
              <AdminPermRoute perm={P.CATALOG_SUBCATEGORIES_VIEW}>
                <SubcategoriesPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="subcategories/create"
            element={
              <AdminPermRoute perm={P.CATALOG_SUBCATEGORIES_CREATE}>
                <SubcategoryEditorPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="subcategories/:id/edit"
            element={
              <AdminPermRoute perm={P.CATALOG_SUBCATEGORIES_UPDATE}>
                <SubcategoryEditorPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="brands"
            element={
              <AdminPermRoute perm={P.CATALOG_BRANDS_VIEW}>
                <BrandsPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="brands/create"
            element={
              <AdminPermRoute perm={P.CATALOG_BRANDS_CREATE}>
                <BrandEditorPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="brands/:id/edit"
            element={
              <AdminPermRoute perm={P.CATALOG_BRANDS_UPDATE}>
                <BrandEditorPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="models"
            element={
              <AdminPermRoute perm={P.CATALOG_MODELS_VIEW}>
                <ModelsPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="models/create"
            element={
              <AdminPermRoute perm={P.CATALOG_MODELS_CREATE}>
                <ModelEditorPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="models/:id/edit"
            element={
              <AdminPermRoute perm={P.CATALOG_MODELS_UPDATE}>
                <ModelEditorPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="products"
            element={
              <AdminPermRoute perm={P.CATALOG_PRODUCTS_VIEW}>
                <ProductsPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="products/create"
            element={
              <AdminPermRoute perm={P.CATALOG_PRODUCTS_CREATE}>
                <ProductEditorPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="products/:id/edit"
            element={
              <AdminPermRoute perm={P.CATALOG_PRODUCTS_UPDATE}>
                <ProductEditorPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="products/labels"
            element={
              <AdminPermRoute perm={P.CATALOG_PRODUCTS_LABELS}>
                <BulkLabelPrintPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="orders"
            element={
              <AdminPermRoute perm={P.ADMIN_ORDERS}>
                <AdminOrdersPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="orders/:id"
            element={
              <AdminPermRoute perm={P.ADMIN_ORDERS}>
                <AdminOrderDetailPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="coupons/create"
            element={
              <AdminPermRoute adminOnly>
                <CouponEditorPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="coupons/:id/edit"
            element={
              <AdminPermRoute adminOnly>
                <CouponEditorPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="coupons"
            element={
              <AdminPermRoute adminOnly>
                <CouponsPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="reviews"
            element={
              <AdminPermRoute perm={P.ADMIN_REVIEWS}>
                <AdminReviewsPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="stores/create"
            element={
              <AdminPermRoute adminOnly>
                <StoreEditorPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="stores/:id/edit"
            element={
              <AdminPermRoute adminOnly>
                <StoreEditorPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="stores"
            element={
              <AdminPermRoute adminOnly>
                <StoresPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="counters/create"
            element={
              <AdminPermRoute perm={P.ADMIN_COUNTERS}>
                <CounterEditorPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="counters/:id/edit"
            element={
              <AdminPermRoute perm={P.ADMIN_COUNTERS}>
                <CounterEditorPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="counters"
            element={
              <AdminPermRoute perm={P.ADMIN_COUNTERS}>
                <CountersPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="staff/create"
            element={
              <AdminPermRoute adminOnly>
                <StaffEditorPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="staff/:id/edit"
            element={
              <AdminPermRoute adminOnly>
                <StaffEditorPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="staff"
            element={
              <AdminPermRoute adminOnly>
                <StaffPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="roles/create"
            element={
              <AdminPermRoute adminOnly>
                <RoleEditorPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="roles/:id/edit"
            element={
              <AdminPermRoute adminOnly>
                <RoleEditorPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="roles"
            element={
              <AdminPermRoute adminOnly>
                <RolesPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="pos/gst-report"
            element={
              <AdminPermRoute perm={P.FINANCE_POS_GST}>
                <PosGstReportPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="pos/returns"
            element={
              <AdminPermRoute perm={P.FINANCE_POS_RETURNS}>
                <PosReturnsPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="pos/orders/:id"
            element={
              <AdminPermRoute perm={P.FINANCE_POS_ORDERS}>
                <PosOrderDetailPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="pos/orders"
            element={
              <AdminPermRoute perm={P.FINANCE_POS_ORDERS}>
                <PosOrdersPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="pos/billing"
            element={
              <AdminPermRoute perm={P.ACCESS_POS}>
                <PosBillingPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="pos"
            element={
              <AdminPermRoute perm={P.ACCESS_POS}>
                <PosLoginPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="stock-transfer"
            element={
              <AdminPermRoute perm={P.ADMIN_STOCK}>
                <StockTransferPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="stock-transfer/history"
            element={
              <AdminPermRoute perm={P.ADMIN_STOCK}>
                <StockTransferHistoryPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="stock-management/history"
            element={
              <AdminPermRoute perm={P.ADMIN_STOCK}>
                <StockManagementHistoryPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="stock-management/low-stock"
            element={
              <AdminPermRoute perm={P.ADMIN_STOCK}>
                <StockManagementLowStockPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="stock-management/adjust"
            element={
              <AdminPermRoute perm={P.ADMIN_STOCK}>
                <StockManagementAdjustPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="stock-management/product/:id"
            element={
              <AdminPermRoute perm={P.ADMIN_STOCK}>
                <StockManagementProductPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="stock-management"
            element={
              <AdminPermRoute perm={P.ADMIN_STOCK}>
                <StockManagementListPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="returns"
            element={
              <AdminPermRoute perm={P.ADMIN_RETURNS}>
                <AdminReturnsPage />
              </AdminPermRoute>
            }
          />
          <Route
            path="attendance"
            element={
              <AdminPermRoute perm={P.ADMIN_ATTENDANCE}>
                <AdminAttendancePage />
              </AdminPermRoute>
            }
          />
          <Route
            path="income-expense"
            element={
              <AdminPermRoute perm={P.FINANCE_INCOME_EXPENSE}>
                <IncomeExpenseLayout />
              </AdminPermRoute>
            }
          >
            <Route index element={<IeOverview />} />
            <Route path="expense-entry" element={<IeExpenseEntry />} />
            <Route path="expenses" element={<IeExpensesList />} />
            <Route path="income" element={<IeIncomeList />} />
            <Route path="reports" element={<IeReports />} />
          </Route>
        </Route>
      </Routes>
    </Layout>
  );
}

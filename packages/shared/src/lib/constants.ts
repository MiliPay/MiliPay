export const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue",
  "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT",
  "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi",
  "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo",
  "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
] as const;

export const ROUTES = {

  login: "/login",
  dashboard: "/dashboard",
  customers: "/dashboard/customers",
  customerDetails: "/dashboard/customers/:id",
  signupReviews: "/dashboard/customers/signup-reviews",
  signups: "/dashboard/signups",
  transactions: "/dashboard/transactions",
  transactionDetails: "/dashboard/transactions/:id",
  register: "/dashboard/register",
  registerCustomer: "/dashboard/register/customer",
  registerMerchant: "/dashboard/register/merchant",
  merchants: "/dashboard/merchants",
  merchantDetails: "/dashboard/merchants/:id",
  terminals: "/dashboard/terminals",
  settings: "/dashboard/settings",
  staff: "/dashboard/staff",
  staffDetails: "/dashboard/staff/:id",
  support: "/dashboard/support",
  supportDetails: "/dashboard/support/:id",
  operations: "/dashboard/operations",
  audit: "/dashboard/audit",
} as const;
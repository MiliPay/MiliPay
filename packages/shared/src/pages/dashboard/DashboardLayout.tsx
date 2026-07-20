import { Outlet } from "react-router-dom";
import { Sidebar } from "@biopay/shared/components/layout/Sidebar";
import { MobileNav } from "@biopay/shared/components/layout/MobileNav";

export default function DashboardLayout() {
  return (
    <div className="min-h-screen flex bg-ledger">
      <Sidebar />
      <main className="flex-1 min-w-0 h-screen overflow-y-auto pb-20 md:pb-0">
        <Outlet />
      </main>
      <MobileNav />
    </div>
  );
}
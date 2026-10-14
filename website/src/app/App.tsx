import { Link, Navigate, createBrowserRouter, RouterProvider } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Home } from "@/pages/Home";
import { Personal } from "@/pages/Personal";
import { Business } from "@/pages/Business";
import { Agents } from "@/pages/Agents";
import { Help } from "@/pages/Help";
import { About } from "@/pages/About";

function NotFound() {
  return (
    <section className="wrap flex flex-col items-start gap-4 py-24">
      <div className="kicker">Page not found</div>
      <h1 className="h1-page">We couldn't find that page.</h1>
      <Link to="/" className="link-arrow">
        Go to the home page
      </Link>
    </section>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: "personal", element: <Personal /> },
      { path: "business", element: <Business /> },
      { path: "agents", element: <Agents /> },
      { path: "help", element: <Help /> },
      { path: "about", element: <About /> },
      // The old site's addresses.
      { path: "customers", element: <Navigate to="/personal" replace /> },
      { path: "merchants", element: <Navigate to="/business" replace /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}

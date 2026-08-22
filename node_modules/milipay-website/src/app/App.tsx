import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Layout } from "../components/layout/Layout";
import { Home } from "../pages/Home";
import { Customers } from "../pages/Customers";
import { Merchants } from "../pages/Merchants";
import { Agents } from "../pages/Agents";
import { About } from "../pages/About";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: "customers", element: <Customers /> },
      { path: "merchants", element: <Merchants /> },
      { path: "agents", element: <Agents /> },
      { path: "about", element: <About /> },
      { path: "*", element: <div className="p-20 text-center text-xl mt-20">404 Not Found</div> }
    ]
  }
]);

export default function App() {
  return <RouterProvider router={router} />;
}
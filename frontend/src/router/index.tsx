import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";

const rootRoute = createRootRoute();

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/" });
const authSignInRoute = createRoute({ getParentRoute: () => rootRoute, path: "/auth/sign-in" });
const authSignUpRoute = createRoute({ getParentRoute: () => rootRoute, path: "/auth/sign-up" });
const vendorDashboardRoute = createRoute({ getParentRoute: () => rootRoute, path: "/vendor/dashboard" });
const consumerHubRoute = createRoute({ getParentRoute: () => rootRoute, path: "/consumer/hub" });
const consumerSimulationRoute = createRoute({ getParentRoute: () => rootRoute, path: "/consumer/simulation" });

const routeTree = rootRoute.addChildren([
  indexRoute,
  authSignInRoute,
  authSignUpRoute,
  vendorDashboardRoute,
  consumerHubRoute,
  consumerSimulationRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

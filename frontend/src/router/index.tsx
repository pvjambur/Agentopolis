import { Show, UserButton } from '@clerk/react'
import {
  Link,
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  useRouterState,
} from '@tanstack/react-router'
import HomePage from '../pages/Home'
import SignInPage from '../pages/auth/SignIn'
import SignUpPage from '../pages/auth/SignUp'
import RoleSelectPage from '../pages/onboarding/RoleSelect'
import CharacterCreatePage from '../pages/onboarding/CharacterCreate'
import VendorDashboardPage from '../pages/vendor/Dashboard'
import VendorCatalogPage from '../pages/vendor/Catalog'
import VendorAgentTrainPage from '../pages/vendor/AgentTrain'
import ConsumerHubPage from '../pages/consumer/Hub'
import ConsumerMarketplacePage from '../pages/consumer/Marketplace'
import ConsumerAgentTrainPage from '../pages/consumer/AgentTrain'
import SimulationPage from '../pages/consumer/Simulation'
import MissionNewPage from '../pages/consumer/MissionNew'

function RootLayout() {
  const { location } = useRouterState()
  // The landing page ('/') ships its own overlay nav (LandingNav) with jump
  // links + scroll behaviour, so the global bar is suppressed there only.
  const showGlobalNav = location.pathname !== '/'
  return (
    <div className="min-h-screen bg-background text-foreground">
      {showGlobalNav && (
      <nav className="border-b-2 border-accent-dark px-6 py-3 flex items-center justify-between">
        <Link to="/" className="font-pixel font-bold text-xl text-primary tracking-tight">
          Agentopolis
        </Link>
        <div className="flex items-center gap-3">
          <Show when="signed-out">
            <Link
              to="/auth/sign-in"
              className="font-body text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign in
            </Link>
            <Link
              to="/auth/sign-up"
              className="btn-pixel btn-pixel-sm btn-pixel-primary"
            >
              Sign up
            </Link>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </nav>
      )}
      <Outlet />
    </div>
  )
}

const rootRoute = createRootRoute({ component: RootLayout })

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
})
const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/sign-in',
  component: SignInPage,
})
const signUpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/sign-up',
  component: SignUpPage,
})
const roleSelectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/onboarding/role-select',
  component: RoleSelectPage,
})
const characterCreateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/onboarding/character-create',
  component: CharacterCreatePage,
})
const vendorDashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/vendor/dashboard',
  component: VendorDashboardPage,
})
const vendorCatalogRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/vendor/catalog',
  component: VendorCatalogPage,
})
const vendorAgentTrainRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/vendor/agent/train',
  component: VendorAgentTrainPage,
})
const consumerHubRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/consumer/hub',
  component: ConsumerHubPage,
})
const consumerMarketplaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/consumer/marketplace',
  component: ConsumerMarketplacePage,
})
const consumerAgentTrainRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/consumer/agent/train',
  component: ConsumerAgentTrainPage,
})
const consumerSimulationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/consumer/simulation',
  validateSearch: (search: Record<string, unknown>) => ({
    mission_id: typeof search.mission_id === 'string' ? search.mission_id : undefined,
  }),
  component: SimulationPage,
})

const consumerMissionNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/consumer/mission/new',
  component: MissionNewPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  signInRoute,
  signUpRoute,
  roleSelectRoute,
  characterCreateRoute,
  vendorDashboardRoute,
  vendorCatalogRoute,
  vendorAgentTrainRoute,
  consumerHubRoute,
  consumerMarketplaceRoute,
  consumerAgentTrainRoute,
  consumerSimulationRoute,
  consumerMissionNewRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

import { Show, UserButton } from '@clerk/react'
import {
  Link,
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { ProtectedRoute } from '@/components/common/ProtectedRoute'
import HomePage from '../pages/Home'
import SignInPage from '../pages/auth/SignIn'
import SignUpPage from '../pages/auth/SignUp'
import RoleSelectPage from '../pages/onboarding/RoleSelect'
import CharacterCreatePage from '../pages/onboarding/CharacterCreate'
import SimulationPage from '../pages/consumer/Simulation'

// Lazy placeholder stubs for Phase 1 Prompts 3–4
function VendorDashboardPage() {
  return (
    <ProtectedRoute requiredRole="vendor">
      <div className="flex items-center justify-center min-h-[calc(100vh-57px)] text-muted-foreground">
        Vendor dashboard — built in Prompt 4
      </div>
    </ProtectedRoute>
  )
}

function ConsumerHubPage() {
  return (
    <ProtectedRoute requiredRole="consumer">
      <div className="flex items-center justify-center min-h-[calc(100vh-57px)] text-muted-foreground">
        Consumer hub — built in Prompt 4
      </div>
    </ProtectedRoute>
  )
}

function RootLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="border-b px-6 py-3 flex items-center justify-between">
        <Link to="/" className="font-bold text-lg tracking-tight">
          Agentopolis
        </Link>
        <div className="flex items-center gap-3">
          <Show when="signed-out">
            <Link
              to="/auth/sign-in"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign in
            </Link>
            <Link
              to="/auth/sign-up"
              className="text-sm font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity"
            >
              Sign up
            </Link>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </nav>
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
const consumerHubRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/consumer/hub',
  component: ConsumerHubPage,
})
const consumerSimulationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/consumer/simulation',
  component: SimulationPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  signInRoute,
  signUpRoute,
  roleSelectRoute,
  characterCreateRoute,
  vendorDashboardRoute,
  consumerHubRoute,
  consumerSimulationRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

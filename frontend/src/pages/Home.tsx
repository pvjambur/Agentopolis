import { Show } from '@clerk/react'
import { Link } from '@tanstack/react-router'

export default function HomePage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-[calc(100vh-57px)] px-6 text-center gap-6">
      <div className="flex flex-col items-center gap-3 max-w-xl">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Razorpay Hackathon · Agentic Commerce
        </span>
        <h1 className="text-4xl font-bold tracking-tight">
          Welcome to Agentopolis
        </h1>
        <p className="text-muted-foreground text-base leading-relaxed">
          AI agent digital twins negotiate and transact in a live top-down
          marketplace. Every deal is visible. Every payment is real.
        </p>
      </div>

      <Show when="signed-out">
        <div className="flex gap-3">
          <Link
            to="/auth/sign-up"
            className="bg-primary text-primary-foreground px-5 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Get started
          </Link>
          <Link
            to="/auth/sign-in"
            className="border px-5 py-2 rounded-md text-sm font-medium hover:bg-accent transition-colors"
          >
            Sign in
          </Link>
        </div>
      </Show>

      <Show when="signed-in">
        <div className="flex gap-3">
          <Link
            to="/vendor/dashboard"
            className="bg-primary text-primary-foreground px-5 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Vendor dashboard
          </Link>
          <Link
            to="/consumer/hub"
            className="border px-5 py-2 rounded-md text-sm font-medium hover:bg-accent transition-colors"
          >
            Consumer hub
          </Link>
        </div>
      </Show>
    </main>
  )
}

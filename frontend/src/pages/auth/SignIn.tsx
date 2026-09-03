import { SignIn } from '@clerk/react'

export default function SignInPage() {
  return (
    <div className="flex min-h-[calc(100vh-57px)] items-center justify-center p-4">
      <SignIn
        routing="path"
        path="/auth/sign-in"
        signUpUrl="/auth/sign-up"
        fallbackRedirectUrl="/onboarding/role-select"
      />
    </div>
  )
}

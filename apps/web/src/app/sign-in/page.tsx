import Link from "next/link"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/workspace"
import SignInForm from "./sign-in-form"

function sanitizeNextPath(next?: string) {
  if (!next) {
    return null
  }

  if (!next.startsWith("/")) {
    return null
  }

  if (next.startsWith("//")) {
    return null
  }

  return next
}

export default async function SignInPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  const currentUser = await getCurrentUser()
  const nextPath = sanitizeNextPath(next)
  if (currentUser) {
    const workspaceCount = await prisma.workspaceMember.count({ where: { userId: currentUser.id } })
    if (workspaceCount > 0) {
      redirect(nextPath ?? "/dashboard")
    }
    redirect("/onboarding/workspace")
  }

  return (
    <main className="page-shell auth-shell">
      <section className="auth-card">
        <p className="eyebrow">AvatarKit AI</p>
        <h1>Welcome back</h1>
        <p className="hero-copy">
          Sign in to continue to your workspace shell and onboarding flow.
        </p>
        <SignInForm next={next} />
        <p className="form-helper">
          New here? <Link href="/sign-up">Create an account</Link>
        </p>
      </section>
    </main>
  )
}

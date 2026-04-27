import Link from "next/link"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/workspace"
import SignUpForm from "./sign-up-form"

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

export default async function SignUpPage({
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
        <h1>Build the shell first</h1>
        <p className="hero-copy">
          Create your account, then set up your first workspace to unlock the dashboard shell.
        </p>
        <SignUpForm next={next} />
        <p className="form-helper">
          Already have an account? <Link href="/sign-in">Sign in</Link>
        </p>
      </section>
    </main>
  )
}

import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'

export const googleLoginConfigured = Boolean(
 process.env.AUTH_SECRET && process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
)

export const { auth, handlers } = NextAuth({
 providers: googleLoginConfigured ? [Google] : [],
 session: { strategy: 'jwt', maxAge: 86400 },
 callbacks: {
  signIn({ account, profile }) {
   return account?.provider === 'google' && profile?.email_verified === true
  },
 },
})

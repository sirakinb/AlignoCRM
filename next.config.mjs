/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.insforge.app",
      },
    ],
  },
  // Sign-up is closed while we run the waitlist. Anyone landing on /sign-up
  // gets routed to the waitlist on the landing page. Existing users can still
  // log in via /sign-in.
  async redirects() {
    return [
      {
        source: "/sign-up",
        destination: "/#waitlist",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
module.exports = {
  // Ensure Next.js resolves the correct workspace root when multiple lockfiles exist
  outputFileTracingRoot: __dirname,
};
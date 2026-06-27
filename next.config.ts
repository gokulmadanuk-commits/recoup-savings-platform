import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/heavy parsing + doc-gen libs must stay outside the server bundle.
  serverExternalPackages: ["pdfjs-dist", "pdfkit", "exceljs", "docx", "mammoth"],
};

export default nextConfig;

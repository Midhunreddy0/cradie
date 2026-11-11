import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const srcHtml = path.join(rootDir, "templates", "index.html");
const srcStatic = path.join(rootDir, "static");
const wwwDir = path.join(rootDir, "www");
const destHtml = path.join(wwwDir, "index.html");
const destStatic = path.join(wwwDir, "static");

fs.rmSync(wwwDir, { recursive: true, force: true });
fs.mkdirSync(wwwDir, { recursive: true });

let htmlContent = fs.readFileSync(srcHtml, "utf8");
htmlContent = htmlContent.replace(
    /\{\{\s*url_for\(\s*['"]static['"]\s*,\s*filename\s*=\s*['"]([^'"]+)['"]\s*\)\s*\}\}/g,
    "/static/$1"
);
fs.writeFileSync(destHtml, htmlContent, "utf8");

fs.cpSync(srcStatic, destStatic, { recursive: true });

console.log(`Prepared Capacitor mobile bundle at ${wwwDir}`);

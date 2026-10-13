import { rmSync } from "node:fs";
import resetDatabase from "../global-setup";

export default async function setup() {
  rmSync("./storage/e2e-uploads", { recursive: true, force: true });
  await resetDatabase();
}

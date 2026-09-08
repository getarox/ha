import { createApp } from "../../server/_core/index.js";

let appPromise: ReturnType<typeof createApp> | undefined;
export default async function handler(req: any, res: any) {
  appPromise ??= createApp();
  return (await appPromise)(req, res);
}

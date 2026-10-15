import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Finding and loading the vendored sandbox helper.
 *
 * Split out of `windows-isolation.ts` because it is a different job from running
 * the sandbox: this file answers "where is the binary and what shape is its API",
 * the other answers "what did the command do". The two used to be one file, and
 * the vendored types below are long enough to push it past the size discipline
 * on their own.
 *
 * The API is typed structurally rather than imported, so an upstream change
 * surfaces as a compile error here instead of an `any` reaching the ports.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const VENDOR_ROOT = join(HERE, "vendor", "sandbox-runtime");
export const SRT_WIN = join(VENDOR_ROOT, "srt-win", process.arch === "arm64" ? "arm64" : "x64", "srt-win.exe");

/** The dispatch argument the vendored binary expects before its subcommand. */
export const DISPATCH_ARG = "--srt-win";

/**
 * The subset of the vendored module this adapter uses. Typed structurally
 * rather than imported so a change upstream surfaces as a compile error here
 * instead of an `any` leaking into the ports.
 */
export type SrtWinHandle = {
  readonly exe: string;
  readonly prependArgs: readonly string[];
};

export type WindowsStatus = {
  readonly user?: {
    readonly provisioned?: boolean;
    readonly groupExists?: boolean;
    readonly credPresent?: boolean;
    readonly hiddenFromLogon?: boolean;
    readonly sid?: string;
  };
  readonly wfp?: { readonly state?: string; readonly filters?: number };
};

export type VendorWindowsApi = {
  checkWindowsSandboxStatusAsync(o: { srtWin?: SrtWinHandle }): Promise<WindowsStatus>;
  /** Successful resolution means blocked; the vendor throws for every other outcome. */
  verifyWindowsWfpEgress(o: { srtWin?: SrtWinHandle; target?: string }): Promise<{ target: string; stderr: string }>;
  getWindowsSandboxUserStatusAsync(o: { srtWin?: SrtWinHandle }): Promise<{
    provisioned?: boolean;
    credPresent?: boolean;
    sid?: string;
  }>;
  grantWindowsAcl(o: { read: readonly string[]; write: readonly string[]; sandboxUserSid: string; srtWin: SrtWinHandle }): void;
  revokeWindowsAcl(o: { sandboxUserSid: string; srtWin: SrtWinHandle }): readonly { status: string; path: string }[] | undefined;
  SRT_WIN_DISPATCH_ARG1: string;
};

let cached: Promise<VendorWindowsApi> | undefined;

export async function loadVendor(): Promise<VendorWindowsApi> {
  cached ??= import("./vendor/sandbox-runtime/dist/sandbox/windows-sandbox-utils.js") as Promise<VendorWindowsApi>;
  return await cached;
}

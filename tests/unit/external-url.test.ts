import { describe, expect, it } from "vitest";
import { isPrivateOrReservedAddress } from "@/lib/security/external-url";

describe("external URL network filtering", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "::1", "fd00::1", "fe80::1"])(
    "blocks private or reserved address %s",
    (address) => expect(isPrivateOrReservedAddress(address)).toBe(true),
  );

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])("allows public address %s", (address) => {
    expect(isPrivateOrReservedAddress(address)).toBe(false);
  });
});

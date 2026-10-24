/**
 * Автотесты шифрования временных паролей (src/lib/temp-password.ts). Запуск: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { openTempPassword, sealTempPassword } from "./temp-password";

process.env.JWT_SECRET = "test-secret-for-temp-passwords-1234567890";

describe("временные пароли учеников", () => {
  it("в базе — не открытый текст, а расшифровывается обратно", () => {
    const sealed = sealTempPassword("Пароль123");
    assert.ok(sealed.startsWith("enc1:"));
    assert.ok(!sealed.includes("Пароль123"));
    assert.equal(openTempPassword(sealed), "Пароль123");
  });

  it("один и тот же пароль каждый раз шифруется по-разному", () => {
    assert.notEqual(sealTempPassword("same"), sealTempPassword("same"));
  });

  it("старые записи до шифрования читаются как есть", () => {
    assert.equal(openTempPassword("old-plain"), "old-plain");
  });

  it("подменённый шифротекст или чужой секрет сайта — null, а не мусор", () => {
    const sealed = sealTempPassword("secret");
    const broken = sealed.slice(0, -2) + (sealed.endsWith("AA") ? "BB" : "AA");
    assert.equal(openTempPassword(broken), null);
    process.env.JWT_SECRET = "another-secret-another-secret-123";
    assert.equal(openTempPassword(sealed), null);
    process.env.JWT_SECRET = "test-secret-for-temp-passwords-1234567890";
  });
});

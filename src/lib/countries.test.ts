// Run: node src/lib/countries.test.ts
import assert from "node:assert/strict";
import { countryOf, guessCountry, wantsAkahu } from "./countries.ts";

assert.equal(guessCountry(["en-NZ", "en"]), "NZ");
assert.equal(guessCountry(["de"], "Europe/Berlin"), "DE");
assert.equal(guessCountry(["en"], "Australia/Sydney"), "AU");
assert.equal(guessCountry(["en-US"], "Pacific/Auckland"), "NZ"); // the time zone wins
assert.equal(guessCountry(["en-GB", "en-US"], "America/Chicago"), "US"); // a US time zone beats en-GB first
assert.equal(guessCountry(["en-GB"], "America/New_York"), "US");
assert.equal(guessCountry(["en-GB"], "Pacific/Honolulu"), "US");
assert.equal(guessCountry(["en-GB"], "US/Pacific"), "US");
assert.equal(guessCountry(["en-GB"], "America/Toronto"), "CA");
assert.equal(guessCountry(["en-GB"], "America/Bogota"), "GB"); // unlisted zone: falls back to the language
assert.equal(guessCountry(["zz-QQ"], "Mars/Base"), "US");
assert.equal(guessCountry([]), "US");
assert.equal(countryOf(undefined).code, "US"); // existing users without a country
assert.equal(countryOf("XX").name, "Somewhere else");
assert.equal(wantsAkahu({ country: "NZ" }), true);
assert.equal(wantsAkahu({ country: "US" }), false);
assert.equal(wantsAkahu({}), false); // no country means US
assert.equal(wantsAkahu(null), false);
assert.equal(wantsAkahu({ country: "US", alsoBanksIn: ["NZ"] }), true);

console.log("countries ok");

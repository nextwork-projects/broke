// Run: node src/lib/advice.test.ts
import assert from "node:assert/strict";
import { playbook, profileFields, profileQuestions, topicsOf, validSave } from "./advice.ts";

const keys = (c?: string) => profileFields(c).map((f) => f.key);
assert.deepEqual(keys("US"), ["filing", "income", "age", "work", "match", "health", "hsaCover", "dependents", "risk"]);
assert.deepEqual(keys(undefined), keys("US"), "no country = US");
assert.deepEqual(keys("GB"), ["income", "age", "work", "match", "dependents", "risk"], "UK: no filing status, no HSA health plan");
assert.deepEqual(keys("AU"), ["income", "age", "work", "dependents", "risk"], "AU: super is compulsory, no match question");
assert.deepEqual(keys("DE"), ["income", "age", "work", "dependents", "risk"]);

const uk = profileFields("GB");
assert.equal(uk.find((f) => f.key === "match")!.label, "Employer workplace pension match");
assert.equal(uk.find((f) => f.key === "income")!.options[0].label, "Under £50k");
assert.equal(uk.find((f) => f.key === "income")!.options[0].value, "Under $50k", "stored value never changes");
assert.equal(profileFields("NZ").find((f) => f.key === "work")!.options[0].label, "Employee");

// Saves: only this country's questions and listed values.
assert.deepEqual(validSave("US", { health: "High-deductible (HSA eligible)", goals: ["Buy a home", "Get rich"] }), { fields: { health: "High-deductible (HSA eligible)" }, goals: ["Buy a home"], goalPlans: [] });
assert.deepEqual(validSave("GB", { health: "High-deductible (HSA eligible)", filing: "Single" }).fields, {}, "no US-only fields outside the US");
assert.deepEqual(validSave("US", { health: "anything", age: "30-39", notes: "x" }).fields, { age: "30-39" });

assert.deepEqual(topicsOf("Should I open an HSA or max my 401k?"), ["health", "retirement"]);
assert.deepEqual(topicsOf("saving a deposit for my first home"), ["home"]);
assert.deepEqual(topicsOf("where did my money go"), []);

assert.match(playbook("US", ["health"]), /HSA is tax-free in/);
assert.match(playbook("GB", ["health"]), /HSAs are a US account/);
assert.doesNotMatch(playbook("GB", ["retirement", "home"]), /401\(k\)|529|\bHSA\b/);
assert.match(playbook("NZ", ["home"]), /KiwiSaver/);
assert.match(playbook("DE", ["retirement"]), /no detailed rules for this country/);
assert.equal(playbook("US", []), "");
assert.doesNotMatch(profileQuestions("GB"), /health/);
assert.match(profileQuestions("GB"), /"No 401\(k\)" \(shown as "No workplace pension"\)/);
assert.deepEqual(validSave("US", { goalPlans: [{ goal: "Buy a home", amount: 60000.4, by: "2028-10" }, { goal: "Retire early", amount: 1, by: "2030-01" }, { goal: "Buy a home", amount: -5, by: "2028-10" }] }).goalPlans, [{ goal: "Buy a home", amount: 60000, by: "2028-10" }]);
assert.equal(validSave("US", { goalPlans: [{ goal: "Buy a home", amount: 5, by: "next year" }] }).goalPlans.length, 0);
assert.deepEqual(validSave("GB", { hsaCover: "Just me" }).fields, {}, "HSA cover is US only");
console.log("advice: ok");

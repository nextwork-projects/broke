// Run: node src/lib/reply.test.ts
import assert from "node:assert/strict";
import { replyBlocks } from "./reply.ts";

const fence = (kind: string, json: string) => "```" + kind + "\n" + json + "\n```";
{
  const r = replyBlocks(
    ["Mostly **rent**: about $1,400 of the $1,700 you've spent.",
      fence("breakdown", '{"title": "Spent in November", "total": 1700, "rows": [{"label": "Bills & utilities", "amount": 1500}, {"label": "Groceries", "amount": -120}, {"label": "", "amount": 5}]}'),
      fence("actions", '[{"label": "See the charges", "href": "/transactions?q=Maple"}, {"label": "Bad", "href": "https://evil.example"}, {"label": "Bad", "href": "//evil.example"}, {"label": "Bad", "href": "javascript:alert(1)"}]'),
      fence("next", '["What is in bills?", 3, "Compare to October?", "One", "Two"]'),
    ].join("\n"),
  );
  assert.equal(r.body.trim(), "Mostly **rent**: about $1,400 of the $1,700 you've spent.");
  assert.deepEqual(r.breakdown, { title: "Spent in November", total: 1700, rows: [{ label: "Bills & utilities", amount: 1500 }, { label: "Groceries", amount: 120 }] });
  assert.deepEqual(r.actions, [{ label: "See the charges", href: "/transactions?q=Maple" }]); // only paths inside broke
  assert.deepEqual(r.next, ["What is in bills?", "Compare to October?", "One"]); // strings only, 3 at most
}
// A block still streaming in is hidden; broken JSON is dropped, not shown.
assert.equal(replyBlocks("Hi\n```breakdown\n{\"rows\": [").body, "Hi\n");
assert.equal(replyBlocks("Hi\n" + fence("actions", "[oops")).actions.length, 0);
assert.equal(replyBlocks(fence("breakdown", '{"rows": []}')).breakdown, null);
console.log("reply ok");
